"""
沙箱MCP客户端（精简版）

提供代码执行环境，仅保留核心功能：
- Shell命令执行（持久化会话，跨命令/任务/阶段共享环境变量）
- 文件读取
"""

import os
import re
import select
import shlex
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import uuid
import asyncio
from typing import Optional
from dataclasses import dataclass

from .base import MCPToolBase, MCPClientBase, ToolResult, ToolSchema
from ...utils.logger import get_logger

logger = get_logger(__name__)


def _create_sandbox_venv() -> str:
    """
    在系统临时目录中创建专用隔离 venv，供 bash 会话激活使用。

    venv 建在独立的 tempfile.mkdtemp() 目录下，与 work_dir（git clone 目标）
    完全隔离，不会干扰被测仓库的文件结构。
    调用方（PersistentShellSession）负责在 close() 时删除该目录。

    Returns:
        venv 根目录路径（已创建）；创建失败时返回空字符串。
    """
    tmp = tempfile.mkdtemp(prefix="devx_sandbox_venv_")
    venv_path = os.path.join(tmp, "venv")
    result = subprocess.run(
        [sys.executable, "-m", "venv", venv_path],
        check=False,
        capture_output=True,
    )
    if result.returncode == 0 and os.path.isdir(os.path.join(venv_path, "bin")):
        return venv_path
    # 创建失败：清理并返回空，降级到纯 PATH 剥离保护
    shutil.rmtree(tmp, ignore_errors=True)
    return ""


def _build_sandbox_env(sandbox_venv: str) -> dict:
    """
    构造沙箱 bash 会话的环境变量。

    Args:
        sandbox_venv: 预先创建好的隔离 venv 根目录（由 PersistentShellSession 管理）。
                      为空字符串时降级到纯 PATH 剥离模式。

    策略：
    - 从 PATH 中剥离 Agent 自身 .venv/bin，防止 Agent 依赖被会话内命令污染。
    - 将隔离 venv/bin 追加到 PATH 末尾作为兜底，而非置于最前。
      置于最前会遮蔽 LLM 通过 pyenv/conda/系统级安装的新 Python；
      置于末尾则保留其兜底作用（未激活任何环境时裸 python/pip 仍可用）。
    - 不设置 VIRTUAL_ENV：sandbox venv 仅作 PATH 兜底，并非"激活"状态；
      误设 VIRTUAL_ENV 会导致 pip/poetry 等工具优先写入 sandbox venv，
      即使 LLM 已通过 conda activate 或 source activate 切换到了其他环境。
    - 清除 uv 工具链标记，防止 uv pip install 写回 Agent 项目环境。
    """
    env = os.environ.copy()

    sandbox_venv_bin = os.path.join(sandbox_venv, "bin") if sandbox_venv else ""

    # 剥离 Agent 自身 .venv/bin，同时保留其余宿主 PATH
    agent_venv_bin = os.path.dirname(sys.executable)
    path_parts = [p for p in env.get("PATH", "").split(os.pathsep) if p]
    filtered = [p for p in path_parts if os.path.realpath(p) != os.path.realpath(agent_venv_bin)]

    # 将隔离 venv/bin 追加到 PATH 末尾作为兜底（如果创建成功）
    # 不置于最前：避免遮蔽 LLM 在会话内通过 pyenv/conda/系统安装的新 Python。
    if sandbox_venv_bin and os.path.isdir(sandbox_venv_bin):
        filtered = filtered + [sandbox_venv_bin]

    # 不设置 VIRTUAL_ENV：sandbox venv 未激活，误设会干扰 pip/poetry 的安装目标判断
    env.pop("VIRTUAL_ENV", None)
    env.pop("VIRTUAL_ENV_PROMPT", None)

    env["PATH"] = os.pathsep.join(filtered)

    # 清除 uv 工具链标记，防止 uv pip install 写回 Agent 项目环境
    env.pop("UV_PROJECT_ENVIRONMENT", None)

    # 非交互式环境标记：防止安装脚本/包管理器等工具阻塞等待用户输入
    env["DEBIAN_FRONTEND"] = "noninteractive"
    env["PIP_NO_INPUT"] = "1"
    env["GIT_TERMINAL_PROMPT"] = "0"
    # CI=true / NONINTERACTIVE=1 被许多安装脚本（Homebrew、CANN installer 等）识别为非交互模式
    env["CI"] = "true"
    env["NONINTERACTIVE"] = "1"

    return env

# ── 环境快照：命令分类 ────────────────────────────────────────────────────────
#
# 会修改 bash 会话 PATH/环境变量/激活状态的命令，成功执行后记录到 replay 快照，
# 供会话超时重建后 replay 恢复环境。只捕获 exit_code == 0 的命令。
_ENV_REPLAY_PATTERNS = re.compile(
    r'(?:^|&&|\|\|)\s*'
    r'(?:'
    r'export\s+\w+'                          # export VAR=...
    r'|source\s+\S+'                         # source /path/to/script
    r'|\.\s+\S+'                             # . /path/to/script（等同 source）
    r'|conda\s+activate'                     # conda activate <env>
    r'|mamba\s+activate'                     # mamba activate <env>（conda 替代品）
    r'|micromamba\s+activate'                # micromamba activate <env>
    r'|pyenv\s+(?:global|local|shell)'       # pyenv global/local/shell
    r'|nvm\s+use'                            # nvm use <version>
    r'|workon\s+\S+'                         # virtualenvwrapper: workon <env>
    r'|eval\s+"?\$\('                        # eval "$(xxx init -)"
    r')',
    re.MULTILINE
)

# 不可 replay 的命令：会启动交互式子 shell 或阻塞等待，不能写入快照
# pipenv shell / poetry shell 会 exec 一个新 bash，replay 时会永久阻塞
_ENV_NO_REPLAY_PATTERNS = re.compile(
    r'(?:^|&&|\|\|)\s*'
    r'(?:'
    r'pipenv\s+shell'             # pipenv shell：启动交互子 shell
    r'|poetry\s+shell'            # poetry shell：同上
    r')',
    re.MULTILINE
)

# 反激活命令：执行后清除快照中对应的激活条目，避免重建时 replay 重新激活已退出的环境
_ENV_DEACTIVATE_PATTERNS = re.compile(
    r'(?:^|&&|\|\|)\s*'
    r'(?:'
    r'conda\s+deactivate'         # conda deactivate
    r'|mamba\s+deactivate'        # mamba deactivate
    r'|micromamba\s+deactivate'   # micromamba deactivate
    r'|pyenv\s+shell\s+--unset'   # pyenv shell --unset
    r'|nvm\s+deactivate'          # nvm deactivate
    r'|deactivate'                # venv/virtualenv/virtualenvwrapper deactivate
    r')',
    re.MULTILINE
)

# 具有"覆盖"语义的命令前缀：相同 key 在快照中只保留最新一条，避免 replay 时旧值残留
_ENV_OVERRIDE_PREFIXES: list[re.Pattern] = [
    # export PATH 不在此列：PATH 通常是增量追加（export PATH=/new:$PATH），
    # 多条之间有依赖关系，覆盖会丢失中间层。由去重逻辑（完全相同字符串）处理。
    re.compile(r'(export\s+(?!PATH\b)\w+)='),      # export VAR=xxx，排除 PATH
    re.compile(r'(conda\s+activate)\s'),            # conda activate <env>
    re.compile(r'(mamba\s+activate)\s'),            # mamba activate <env>
    re.compile(r'(micromamba\s+activate)\s'),       # micromamba activate <env>
    re.compile(r'(pyenv\s+global)\s'),              # pyenv global <ver>
    re.compile(r'(pyenv\s+local)\s'),
    re.compile(r'(pyenv\s+shell)\s(?!--unset)'),    # pyenv shell <ver>（排除 --unset）
    re.compile(r'(nvm\s+use)\s'),                   # nvm use <ver>
    re.compile(r'(workon)\s'),                      # workon <env>
]

# 超时错误路径：对部分输出做保护性截断，避免超长字符串进入错误消息。
# 正常执行路径不在此截断——ToolResult.data 保留完整输出，
# 由 nodes.py 的 _trim_for_prompt 统一负责注入 prompt 前的截断。
_TIMEOUT_OUTPUT_LIMIT = 12000
_HEAD_RATIO = 0.4   # 头部占 40%
_TAIL_RATIO = 0.6   # 尾部占 60%（错误通常在末尾）


def _trim_output(output: str) -> str:
    """仅用于超时错误路径：截断部分输出，避免超长字符串进入错误消息。"""
    if len(output) <= _TIMEOUT_OUTPUT_LIMIT:
        return output
    head_limit = int(_TIMEOUT_OUTPUT_LIMIT * _HEAD_RATIO)
    tail_limit = _TIMEOUT_OUTPUT_LIMIT - head_limit
    head = output[:head_limit]
    tail = output[-tail_limit:]
    skipped = len(output) - head_limit - tail_limit
    return f"{head}\n\n...(中间 {skipped} 字符已折叠，仅保留头部和尾部)...\n\n{tail}"


@dataclass
class SandboxToolConfig:
    """沙箱工具配置"""
    mode: str = "local"  # local / docker
    work_dir: str = "/tmp/devx_workspace"
    shell: str = "/bin/bash"
    timeout: int = 600   # 与 base_config.yaml tools.sandbox.timeout 保持一致；编译/构建等长耗时任务需要
    docker_image: str = "ubuntu:22.04"
    container_name: str = "devx-sandbox"


class PersistentShellSession:
    """
    持久化 Shell 会话

    维护一个长驻的 bash 进程，通过 stdin/stdout 管道通信。
    所有 shell_exec 调用均在同一进程内执行，因此 export、source、cd 等
    操作的效果可以在整个程序运行期间（跨命令、跨 task、跨 phase）持续生效。

    超时重建机制：
    当命令超时导致 bash 进程被 kill 后，下次执行时自动重建会话，并通过
    _env_replay_cmds 记录的历史环境命令进行 replay，恢复 export/source/
    conda activate 等环境状态，保证重建对调用方基本透明。
    """

    # 用于标识每次命令输出结束的唯一边界标记前缀
    _SENTINEL_PREFIX = "__DEVX_CMD_DONE__"

    def __init__(self, work_dir: str, shell: str = "/bin/bash"):
        self._work_dir = work_dir
        self._shell = shell
        self._proc: Optional[subprocess.Popen] = None
        self._lock = threading.Lock()
        self._started = False
        # 会话被 kill 后置 True，run() 在拿到锁后检测到此标志会重置并让 _ensure_started 重建会话
        self._killed = False
        self._session_cwd: str = work_dir   # 跟踪会话内实际 cwd（由哨兵行实时同步）
        # 环境快照：记录所有成功执行的环境变更命令（export/source/conda activate 等），
        # 供会话超时重建后 replay，恢复会话环境状态。
        self._env_replay_cmds: list[str] = []
        # 提前创建隔离 venv，与 work_dir 完全分离，不干扰 git clone 目录结构
        self._sandbox_venv: str = _create_sandbox_venv()

    def _ensure_started(self):
        """
        确保 bash 进程已启动（惰性初始化）。
        若上次会话因超时被 kill，重建后自动：
          1. replay 所有历史环境变更命令（恢复 export/source/conda activate 等）
          2. 恢复工作目录
          3. 发送探针命令（printf）并消费其输出，确认 bash 就绪且 replay 已消化

        注意：使用 text=False + bufsize=0（二进制无缓冲模式）避免
        Python TextIOWrapper 内部缓冲与 select() 产生死锁：
        TextIOWrapper 一次读入多行数据到内部缓冲后，OS pipe 变空，
        select() 永远返回 "not ready"，导致哨兵行卡在缓冲区无法被读取。
        """
        if self._started and self._proc and self._proc.poll() is None:
            return
        os.makedirs(self._work_dir, exist_ok=True)
        self._proc = subprocess.Popen(
            [self._shell],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,   # stderr 合并到 stdout
            cwd=self._work_dir,
            env=_build_sandbox_env(self._sandbox_venv),  # 剥离 Agent .venv/bin，sandbox venv 作末尾兜底
            text=False,                 # 二进制模式：避免 TextIOWrapper 内部缓冲遮蔽 select()
            bufsize=0,                  # 无缓冲：os.read() 直接读 OS pipe，select() 状态与实际一致
            start_new_session=True,     # 独立进程组，kill 时可用 killpg 清理所有子进程
        )
        self._started = True
        self._killed = False

        # 重建后：replay 历史环境命令 + 恢复工作目录
        # 所有命令拼为一个脚本一次性写入，replay 是尽力而为，失败不阻断主流程。
        #
        # source 命令的特殊处理：
        # source 脚本执行后会修改当前 bash 的环境变量（PATH、LD_LIBRARY_PATH 等），
        # 但新 bash 进程启动时这些变量只存在于 _build_sandbox_env() 的快照里，
        # 不会自动传入新进程。因此每条 source/. 命令 replay 后，追加
        # "export $(compgen -e)" 将当前 bash 所有环境变量导出，确保子进程可见，
        # 并用 eval "$(export -p)" 让后续命令读到最新值（即变量刷新到进程环境表）。
        # 实际上 source 本身就在当前 bash 环境生效；此处的额外 export 步骤是为了
        # 确保 source 设置的变量对 bash 的子进程（编译器、pip 等）也可见。
        replay_lines: list[str] = []
        if self._env_replay_cmds:
            for cmd in self._env_replay_cmds:
                replay_lines.append(cmd)
                # 以下命令执行后会修改当前 bash 的环境变量，需要显式 export 刷新，
                # 确保后续子进程（gcc、pip、python 等）能继承完整环境：
                #   - source / .：直接执行环境脚本（CANN、CUDA、venv activate 等）
                #   - conda/mamba/micromamba activate：激活 conda 环境，修改 PATH/CONDA_PREFIX 等
                #   - workon：virtualenvwrapper 激活，修改 PATH/VIRTUAL_ENV 等
                # compgen -e 列出当前所有已赋值的环境变量名，export 将其标记为可继承。
                stripped_cmd = cmd.strip()
                if re.match(
                    r'^(?:source\s+\S|\.\s+\S'
                    r'|(?:conda|mamba|micromamba)\s+activate'
                    r'|workon\s+\S)',
                    stripped_cmd
                ):
                    replay_lines.append(
                        r"__devx_vars=$(compgen -e 2>/dev/null) && "
                        r"[ -n \"$__devx_vars\" ] && "
                        r"export $__devx_vars 2>/dev/null || true"
                    )
            logger.debug("[sandbox] 会话重建：replay %d 条环境命令", len(self._env_replay_cmds))
        if self._session_cwd and self._session_cwd != self._work_dir:
            replay_lines.append(
                f"cd {shlex.quote(self._session_cwd)} 2>/dev/null || cd {shlex.quote(self._work_dir)}"
            )

        # 探针标记：replay 写入后追加一条 printf，消费所有 replay 输出并确认 bash 就绪
        probe_marker = f"__DEVX_REPLAY_READY__{uuid.uuid4().hex}"
        replay_lines.append(f"printf '%s\\n' '{probe_marker}'")

        try:
            script = "\n".join(replay_lines) + "\n"
            self._proc.stdin.write(script.encode())
            self._proc.stdin.flush()
        except OSError:
            return  # 写入失败，主命令执行时会自然报错

        # 消费 replay 输出直到探针标记出现（最多等待 30s）
        deadline = time.time() + 30
        stdout_fd = self._proc.stdout.fileno()
        line_buf = b""
        while time.time() < deadline:
            remaining = deadline - time.time()
            ready, _, _ = select.select([stdout_fd], [], [], min(remaining, 1.0))
            if not ready:
                continue
            try:
                chunk = os.read(stdout_fd, 8192)
            except OSError:
                break
            if not chunk:
                break
            line_buf += chunk
            while b"\n" in line_buf:
                nl_pos = line_buf.index(b"\n")
                line = line_buf[: nl_pos + 1].decode("utf-8", errors="replace").rstrip("\r\n")
                line_buf = line_buf[nl_pos + 1:]
                if probe_marker in line:
                    logger.debug("[sandbox] 会话重建：replay 完成，bash 已就绪")
                    return  # 探针命中，重建完成

        # 探针超时：说明某条 replay 命令（如 source/conda activate 脚本）阻塞了 bash，
        # 当前 bash 进程处于半死状态，继续向其发主命令必然超时（lines=0 永久等待）。
        # 正确策略：kill 卡死的 bash，清空 replay 快照，以干净会话重建一次。
        # 清空快照是必要的——若不清，重建后会再次 replay 同一批阻塞命令，陷入死循环。
        logger.warning(
            "[sandbox] 会话重建：replay 探针等待超时，bash 未就绪；"
            "kill 卡死进程，清空 replay 快照，以干净会话重建"
        )
        self._kill_proc()
        self._env_replay_cmds = []   # 清空快照，避免重建后再次 replay 同一阻塞命令
        self._started = False

        # 不递归调用 _ensure_started，避免潜在无限递归；
        # 直接启动干净的 bash（无任何 replay，不写入探针），让主命令在就绪进程上执行。
        os.makedirs(self._work_dir, exist_ok=True)
        self._proc = subprocess.Popen(
            [self._shell],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            cwd=self._work_dir,
            env=_build_sandbox_env(self._sandbox_venv),
            text=False,
            bufsize=0,
            start_new_session=True,
        )
        self._started = True
        self._killed = False
        logger.debug("[sandbox] 会话重建：已启动干净 bash（无 replay）")

    def update_session_cwd(self, cwd: str) -> None:
        """更新会话记录的当前工作目录（供外部在 cd 成功后同步，哨兵行会自动同步真实 cwd）。"""
        self._session_cwd = cwd

    @staticmethod
    def _extract_env_subcommands(command: str) -> list[str]:
        """
        从复合命令（如 apt-get install -y xxx && export PATH=... && pip install yyy）中
        提取出真正的环境变更子命令，避免将耗时安装命令整体写入 replay 快照。

        只提取以下几类子命令（按分隔符 &&、||、; 拆分后逐段判断）：
          - export VAR=...
          - source /path、. /path
          - conda activate / deactivate
          - pyenv global/local/shell
          - nvm use
          - eval "$(xxx init -)"

        其余子命令（apt-get、pip、make 等）不入快照。
        若命令本身就是单条环境命令（无复合），直接返回 [command]。
        """
        # 若命令不含分隔符，直接判断是否为环境命令
        if not re.search(r'&&|\|\||;', command):
            return [command.strip()] if command.strip() else []

        # 若整条命令本身就是单条 export（分号在引号内的情况，如 export FOO="a;b"），
        # 不拆分，直接作为整体命令返回，避免引号内分号被误作分隔符。
        # 判断方式：去掉引号内内容后是否还含分隔符。
        _stripped_quotes = re.sub(r'"[^"]*"|\'[^\']*\'', '', command)
        if not re.search(r'&&|\|\||;', _stripped_quotes):
            return [command.strip()]

        # 按 &&、||、; 拆分（不处理引号内的分隔符，这是简化处理，覆盖绝大多数实际场景）
        # 注意：经过上面的引号剥离检查，到这里的命令确认含有引号外的分隔符
        parts = re.split(r'&&|\|\||;', command)
        result = []
        for part in parts:
            part = part.strip()
            if not part:
                continue
            if _ENV_REPLAY_PATTERNS.search(part) or _ENV_DEACTIVATE_PATTERNS.search(part):
                result.append(part)
        return result

    def _update_env_replay(self, command: str) -> None:
        """
        将成功执行的环境变更命令维护到 replay 快照。

        处理逻辑：
        0. 若为复合命令（含 && || ;），先提取其中的环境变更子命令，逐条处理。
        1. 反激活命令（conda deactivate / deactivate 等）：
           清除快照中所有对应的激活命令，反激活命令本身不入快照。
        2. 具有覆盖语义的命令（export VAR=、conda activate、pyenv global 等）：
           同 key 在快照中只保留最新一条，防止 replay 时旧值残留或快照膨胀。
        3. 其他环境命令（source、eval 等）：
           完全相同字符串去重后追加。
        """
        # 0. 提取环境变更子命令（处理 "apt install && export PATH=..." 类复合命令）
        subcmds = self._extract_env_subcommands(command)
        if len(subcmds) > 1 or (len(subcmds) == 1 and subcmds[0] != command.strip()):
            # 复合命令：递归处理每条子命令
            for sub in subcmds:
                self._update_env_replay(sub)
            return
        # 1. 反激活命令：清除快照中相关激活条目，自身不入快照
        if _ENV_DEACTIVATE_PATTERNS.search(command):
            before = len(self._env_replay_cmds)
            # 清除所有激活类命令：
            #   - conda/mamba/micromamba activate
            #   - source .../activate（venv/virtualenv/virtualenvwrapper 激活脚本）
            #   - workon <env>（virtualenvwrapper）
            # 不使用宽泛的 \bactivate\b，避免误删路径中恰好含 activate 字样的 source 命令
            # （如 source activate_npu.sh，这是环境变量脚本而非 venv 激活脚本）
            self._env_replay_cmds = [
                c for c in self._env_replay_cmds
                if not re.search(
                    r'(?:conda|mamba|micromamba)\s+activate\b'
                    r'|(?:^|[;&|])\s*(?:source\s+\S*[/.]activate\b|\.\s+\S*[/.]activate\b)'
                    r'|(?:^|[;&|])\s*workon\s+\S',
                    c
                )
            ]
            removed = before - len(self._env_replay_cmds)
            if removed:
                logger.debug("[sandbox] 环境快照：反激活命令清除 %d 条激活记录", removed)
            return

        # 2. 覆盖语义：同 key 只保留最新一条
        for pat in _ENV_OVERRIDE_PREFIXES:
            m = pat.search(command)
            if m:
                key = m.group(1)
                old_len = len(self._env_replay_cmds)
                self._env_replay_cmds = [
                    c for c in self._env_replay_cmds
                    if not (pat.search(c) and pat.search(c).group(1) == key)
                ]
                removed = old_len - len(self._env_replay_cmds)
                self._env_replay_cmds.append(command)
                logger.debug(
                    "[sandbox] 环境快照：覆盖更新（替换 %d 条）: %.80s",
                    removed, command.replace("\n", " ")
                )
                return

        # 3. 其他：完全相同字符串去重后追加
        if command not in self._env_replay_cmds:
            self._env_replay_cmds.append(command)
            logger.debug(
                "[sandbox] 环境快照：追加（共 %d 条）: %.80s",
                len(self._env_replay_cmds), command.replace("\n", " ")
            )

    def kill_and_wait_lock(self, wait_timeout: float = 10.0) -> None:
        """
        Kill 整个进程组并等待 _lock 被当前持有者释放（供 asyncio 超时兜底使用）。
        先设置 _killed 标志，使 run() 拿到锁后也能感知并主动退出，
        防止 run() 在 kill 时尚未进入 with 块导致等待形同虚设。
        等待超时后放弃，避免永久阻塞。
        """
        self._killed = True          # 先置标志，run() 拿锁后会检测到并提前退出
        self._kill_proc()
        acquired = self._lock.acquire(timeout=wait_timeout)
        if acquired:
            self._lock.release()

    def _kill_proc(self):
        """
        杀死 bash 进程及其整个进程组（包含 pip、build.sh 等所有子进程）。
        使用 SIGKILL 确保子进程不会继续持有 stdout 管道写端，防止后续 os.read() 永久阻塞。
        kill 后 wait() reap 僵尸进程，避免内核进程表泄漏。
        必须在持有 _lock 的情况下调用，或在 close()/kill_and_wait_lock() 中调用。
        """
        if self._proc is None:
            return
        try:
            pgid = os.getpgid(self._proc.pid)
            os.killpg(pgid, signal.SIGKILL)
        except (ProcessLookupError, OSError):
            # 进程已退出或 pgid 查询失败，直接 kill pid 兜底
            try:
                self._proc.kill()
            except Exception:
                pass
        # reap 僵尸进程，不阻塞
        try:
            self._proc.wait(timeout=3)
        except Exception:
            pass
        self._started = False

    def run(self, command: str, timeout: int = 600) -> tuple[str, int]:
        """
        在持久化 bash 会话中执行命令。

        Returns:
            (output, exit_code)
        """
        with self._lock:
            # asyncio 层超时兜底可能在 run() 还未进入 with 块时就设置了 _killed，
            # 检测到后直接抛出，让调用方走 TimeoutExpired 路径而非执行错误命令。
            if self._killed:
                self._killed = False
                raise subprocess.TimeoutExpired(command, timeout)

            self._ensure_started()

            sentinel = f"{self._SENTINEL_PREFIX}_{uuid.uuid4().hex}"

            # 注意：不能用括号 (...) 包裹命令——括号会创建子 shell，
            # 导致 export / source / cd 等只在子 shell 内生效，父 shell 看不到。
            # 正确做法：直接执行命令，之后用 $? 捕获退出码，再输出哨兵行。
            # 多行命令通过 here-doc 或分号拼接；这里用换行安全拼接即可。
            #
            # 若上一条命令留下未闭合状态（如未闭合引号），bash 会持续等待续行直至超时，
            # 超时后会 kill 进程并重建 session（见下方超时处理逻辑），这是正确的兜底方案。
            #
            # 哨兵行格式：SENTINEL:exit_code:cwd
            # cwd 由 $(pwd) 实时获取，解决 cd -、pushd/popd 无法静态推断的问题。
            wrapped = (
                f"{command}\n"
                # 先输出一个换行，尽量避免哨兵与上一条输出粘连到同一行；
                # 同时保留行内匹配兜底（见下方 sentinel_re）。
                f"__devx_rc=$?; __devx_cwd=$(pwd 2>/dev/null || echo ''); "
                f"printf '\\n%s:%s:%s\\n' '{sentinel}' \"$__devx_rc\" \"$__devx_cwd\"\n"
            )

            try:
                self._proc.stdin.write(wrapped.encode())
                self._proc.stdin.flush()
            except OSError:
                # bash 意外崩溃导致管道已关闭，重置会话状态并抛出
                self._started = False
                raise

            lines = []
            exit_code = 0
            deadline = time.time() + timeout
            stdout_fd = self._proc.stdout.fileno()
            t_start = time.time()
            last_log_time = t_start
            total_chars = 0
            line_count = 0

            logger.debug(
                "[sandbox] 开始读取输出 | timeout=%ds | cmd=%.120s",
                timeout, command.replace("\n", " ")
            )

            # 哨兵正则：匹配 SENTINEL:exit_code:cwd（cwd 可能为空）
            sentinel_re = re.compile(rf"{re.escape(sentinel)}:(-?\d+):(.*)")

            # 使用 os.read() 直接读 OS pipe（raw bytes），避免 TextIOWrapper 内部缓冲
            # 与 select() 产生死锁（TextIOWrapper 可能一次读入多行到内部缓冲，使 OS pipe
            # 变空，导致 select() 永远返回 "not ready"，哨兵行卡在缓冲区无法被读取）。
            line_buf = b""   # 跨 os.read() 调用的行缓冲（字节），用于处理跨块的不完整行
            done = False
            while not done:
                remaining = deadline - time.time()
                if remaining <= 0:
                    # 超时：kill 整个进程组并重建会话
                    self._kill_proc()
                    partial = "".join(lines).strip()
                    elapsed = time.time() - t_start
                    logger.warning(
                        "[sandbox] 命令超时 | elapsed=%.1fs | lines=%d | chars=%d | cmd=%.120s",
                        elapsed, line_count, total_chars, command.replace("\n", " ")
                    )
                    exc = subprocess.TimeoutExpired(command, timeout)
                    exc.output = partial  # 附带超时前已收集的部分输出
                    raise exc

                # select 仅用于等待 OS pipe 可读，不依赖 Python 层缓冲
                ready, _, _ = select.select([stdout_fd], [], [], min(remaining, 1.0))
                if not ready:
                    # 本轮 select 超时（1s 粒度），每 60s 打一次进度日志
                    now = time.time()
                    if now - last_log_time >= 60:
                        logger.debug(
                            "[sandbox] 等待输出中 | elapsed=%.1fs | lines=%d | chars=%d | remaining=%.1fs",
                            now - t_start, line_count, total_chars, deadline - now
                        )
                        last_log_time = now
                    continue

                # 直接从 OS pipe 读取原始字节（无 Python 层缓冲）
                try:
                    chunk = os.read(stdout_fd, 8192)
                except OSError:
                    chunk = b""
                if not chunk:
                    # 进程意外退出（EOF）
                    self._started = False
                    logger.warning(
                        "[sandbox] bash 进程意外退出 | elapsed=%.1fs | lines=%d | chars=%d",
                        time.time() - t_start, line_count, total_chars
                    )
                    break

                line_buf += chunk

                # 逐行处理缓冲区中所有完整行（以 \n 结尾）
                while b"\n" in line_buf:
                    nl_pos = line_buf.index(b"\n")
                    raw_line = line_buf[: nl_pos + 1]
                    line_buf = line_buf[nl_pos + 1 :]

                    line = raw_line.decode("utf-8", errors="replace")
                    line_count += 1
                    total_chars += len(line)
                    stripped = line.rstrip("\r\n")
                    m = sentinel_re.search(stripped)
                    if m:
                        # 若哨兵与业务输出在同一行，保留哨兵前的内容
                        prefix = stripped[: m.start()]
                        if prefix:
                            lines.append(prefix + "\n")
                        try:
                            exit_code = int(m.group(1))
                        except ValueError:
                            exit_code = 0
                        # 同步真实 cwd（由 bash pwd 获取，准确反映 cd -/pushd/popd 等的效果）
                        real_cwd = m.group(2).strip()
                        if real_cwd:
                            self._session_cwd = real_cwd
                        logger.debug(
                            "[sandbox] 命令完成 | elapsed=%.1fs | lines=%d | chars=%d | exit_code=%d | cwd=%s",
                            time.time() - t_start, line_count, total_chars, exit_code, self._session_cwd
                        )
                        done = True
                        break

                    lines.append(line)

            output = "".join(lines).strip()

            # 若命令成功执行且涉及环境变更或反激活，更新 replay 快照。
            # 仅在 exit_code == 0 时处理，避免将失败命令纳入快照。
            # _ENV_NO_REPLAY_PATTERNS（pipenv shell / poetry shell 等）会启动交互子 shell，
            # replay 时会永久阻塞，显式排除不入快照。
            if exit_code == 0 and not _ENV_NO_REPLAY_PATTERNS.search(command) and (
                _ENV_REPLAY_PATTERNS.search(command)
                or _ENV_DEACTIVATE_PATTERNS.search(command)
            ):
                self._update_env_replay(command)

            return output, exit_code

    def close(self):
        """关闭持久化会话并清理隔离 venv"""
        with self._lock:
            if self._proc and self._proc.poll() is None:
                try:
                    self._proc.stdin.write(b"exit\n")
                    self._proc.stdin.flush()
                    self._proc.wait(timeout=5)
                except Exception:
                    self._kill_proc()
                    try:
                        self._proc.wait(timeout=3)
                    except Exception:
                        pass
            self._started = False
        # 清理隔离 venv 临时目录（位于系统 tmpdir，与 work_dir 无关）
        if self._sandbox_venv:
            # mkdtemp 创建的是 venv 的父目录（prefix=devx_sandbox_venv_）
            parent = os.path.dirname(self._sandbox_venv)
            shutil.rmtree(parent, ignore_errors=True)
            self._sandbox_venv = ""


async def _ensure_container_running(config: SandboxToolConfig) -> None:
    """
    确保 Docker 容器正在运行。

    执行顺序：
    1. inspect 容器状态（同时判断是否存在、是否运行）
    2. 若正在运行 → 直接返回
    3. 若已存在但已停止 → docker start 启动
    4. 若不存在 → docker run -d 创建并启动，挂载工作目录，以 tail -f /dev/null 保持前台

    所有 subprocess 调用均通过 run_in_executor 卸载到线程池，不阻塞事件循环。
    """
    loop = asyncio.get_running_loop()

    def _check_and_start() -> None:
        # 用 inspect 一次性获取容器状态（存在性 + 运行状态）
        inspect = subprocess.run(
            ["docker", "inspect", "--format", "{{.State.Running}}", config.container_name],
            capture_output=True, text=True, timeout=30
        )
        if inspect.returncode == 0:
            if inspect.stdout.strip() == "true":
                return  # 已在运行，无需操作
            # 容器存在但已停止，重新启动
            logger.info("[sandbox-docker] 容器 %s 已停止，正在启动...", config.container_name)
            start = subprocess.run(
                ["docker", "start", config.container_name],
                capture_output=True, text=True, timeout=30
            )
            if start.returncode != 0:
                raise RuntimeError(
                    f"启动容器 {config.container_name} 失败: {start.stderr.strip()}"
                )
            return

        # 容器不存在，创建并启动
        logger.info(
            "[sandbox-docker] 容器 %s 不存在，正在创建（镜像: %s）...",
            config.container_name, config.docker_image
        )
        os.makedirs(config.work_dir, exist_ok=True)
        run = subprocess.run(
            [
                "docker", "run", "-d",
                "--name", config.container_name,
                "-v", f"{config.work_dir}:{config.work_dir}",
                config.docker_image,
                "tail", "-f", "/dev/null",
            ],
            capture_output=True, text=True, timeout=120
        )
        if run.returncode != 0:
            raise RuntimeError(
                f"创建容器 {config.container_name} 失败: {run.stderr.strip()}"
            )
        # 确保工作目录在容器内存在（镜像内可能没有该路径）
        subprocess.run(
            ["docker", "exec", config.container_name, "mkdir", "-p", config.work_dir],
            capture_output=True, text=True, timeout=30
        )
        logger.info("[sandbox-docker] 容器 %s 已创建并启动", config.container_name)

    await loop.run_in_executor(None, _check_and_start)


class ShellExecTool(MCPToolBase[SandboxToolConfig]):
    """Shell命令执行工具（持久化会话版）"""
    
    def __init__(self, config: SandboxToolConfig = None):
        super().__init__(config)
        cfg = config or SandboxToolConfig()
        self._cwd = cfg.work_dir
        # 本地模式使用持久化会话；docker 模式仍走独立 subprocess
        self._session: Optional[PersistentShellSession] = None
        if cfg.mode != "docker":
            self._session = PersistentShellSession(
                work_dir=cfg.work_dir,
                shell=cfg.shell,
            )
    
    @property
    def name(self) -> str:
        return "shell_exec"
    
    @property
    def description(self) -> str:
        return "执行Shell命令，返回输出结果（持久化会话，跨调用共享环境变量）"
    
    def get_schema(self) -> ToolSchema:
        return ToolSchema(
            name=self.name,
            description=self.description,
            parameters={
                "command": {"type": "string", "description": "要执行的Shell命令"},
                "workdir": {"type": "string", "description": "工作目录（可选）。指定后命令将在该目录下执行，后续调用若不指定则维持上次目录"},
                "timeout": {"type": "integer", "description": "超时时间秒（默认600，编译/构建等耗时任务可按需调大）"}
            },
            required=["command"]
        )
    
    async def execute(self, command: str, workdir: str = None, timeout: int = None, **kwargs) -> ToolResult:
        """执行Shell命令"""
        config = self.config or SandboxToolConfig()
        timeout = timeout or config.timeout

        # 若调用方指定了 workdir，则在持久化会话中先 cd 到该目录
        if workdir and workdir != self._cwd:
            self._cwd = workdir
            if config.mode != "docker":
                # 在 bash 会话中实际切换目录，确保后续命令在正确位置执行
                cd_cmd = f"cd {shlex.quote(workdir)}"
                try:
                    await self._persistent_exec(cd_cmd, timeout)
                    if self._session:
                        self._session.update_session_cwd(workdir)
                except Exception:
                    pass  # cd 失败不阻塞主命令执行

        # 静态推断命令中最后一个有效 cd 目标（处理 cmd1 && cd /path 形式）
        # 注意：此推断仅用于 workdir 参数的前置 cd；真实 cwd 已由哨兵行实时同步到
        # _session_cwd，命令执行后直接从 session 读取，无需依赖静态推断的准确性。
        try:
            if config.mode == "docker":
                return await self._docker_exec(command, workdir or self._cwd, timeout, config)
            else:
                result = await self._persistent_exec(command, timeout)
                # 从 session 同步真实 cwd（哨兵行已在 run() 中更新 _session_cwd）
                if self._session:
                    self._cwd = self._session._session_cwd
                return result
        except subprocess.TimeoutExpired as e:
            msg = f"命令超时 ({timeout}s)"
            partial = getattr(e, "output", None)
            if partial:
                partial = _trim_output(partial)
                msg += f"\n--- 超时前部分输出 ---\n{partial}"
            return ToolResult.error_result(msg)
        except Exception as e:
            return ToolResult.error_result(str(e))

    async def _persistent_exec(self, command: str, timeout: int) -> ToolResult:
        """在持久化 bash 会话中执行命令"""
        loop = asyncio.get_running_loop()
        # 在线程池中执行阻塞的 IO，避免阻塞事件循环。
        # 同时用 asyncio.wait_for 加外层超时保障：
        # 即使线程内的 select/readline 因某种原因失效，asyncio 层也会在超时后
        # 抛出 TimeoutError，并强制 kill bash 进程组、重置会话。
        # 外层裕量设为 +30s：给编译等长耗时任务 kill 后的资源释放留足时间。
        try:
            future = loop.run_in_executor(None, self._session.run, command, timeout)
            output, exit_code = await asyncio.wait_for(future, timeout=timeout + 30)
        except asyncio.TimeoutError:
            # asyncio 层超时兜底：kill 整个进程组，释放管道写端，
            # 使线程内的 readline() 尽快返回 EOF，从而释放 _lock。
            # 同时等待 _lock 被释放，防止下一条命令在 _lock 处死锁。
            await loop.run_in_executor(
                None, self._session.kill_and_wait_lock, 10.0
            )
            raise subprocess.TimeoutExpired(command, timeout)
        return ToolResult(
            success=exit_code == 0,
            data=output or "(无输出)",
            error=None if exit_code == 0 else f"命令执行失败，退出码: {exit_code}",
            exit_code=exit_code,
            metadata={"cwd": self._cwd, "raw_output": output}
        )
    
    async def _docker_exec(self, command: str, workdir: str, timeout: int, config: SandboxToolConfig) -> ToolResult:
        """
        Docker 执行（每次独立 subprocess，docker exec 本身已隔离）。

        执行前先确保容器正在运行；subprocess 调用通过 run_in_executor 卸载到
        线程池，不阻塞 asyncio 事件循环。
        """
        # 确保容器已启动（不存在则自动创建）
        await _ensure_container_running(config)

        exec_cmd = [
            "docker", "exec",
            "-w", workdir,
            "-e", "DEBIAN_FRONTEND=noninteractive",
            "-e", "PIP_NO_INPUT=1",
            "-e", "GIT_TERMINAL_PROMPT=0",
            "-e", "NONINTERACTIVE=1",
            config.container_name,
            config.shell, "-c", command,
        ]

        loop = asyncio.get_running_loop()

        def _run() -> subprocess.CompletedProcess:
            return subprocess.run(
                exec_cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
            )

        result = await loop.run_in_executor(None, _run)

        raw_output = (result.stdout + result.stderr).strip()

        if result.returncode == 0:
            return ToolResult(
                success=True,
                data=raw_output or "(无输出)",
                exit_code=result.returncode,
                metadata={"cwd": workdir, "raw_output": raw_output}
            )
        else:
            return ToolResult(
                success=False,
                data=raw_output or "(无输出)",
                error=raw_output or f"命令执行失败，退出码: {result.returncode}",
                exit_code=result.returncode,
                metadata={"cwd": workdir, "raw_output": raw_output}
            )

    async def cleanup(self) -> None:
        """清理持久化会话"""
        if self._session:
            self._session.close()
        await super().cleanup()


class FileReadTool(MCPToolBase[SandboxToolConfig]):
    """文件读取工具"""
    
    @property
    def name(self) -> str:
        return "file_read"
    
    @property
    def description(self) -> str:
        return "读取文件内容"
    
    def get_schema(self) -> ToolSchema:
        return ToolSchema(
            name=self.name,
            description=self.description,
            parameters={
                "path": {"type": "string", "description": "文件路径"},
                "max_lines": {"type": "integer", "description": "最大读取行数（默认 2000，通常无需指定）"}
            },
            required=["path"]
        )
    
    async def execute(self, path: str, max_lines: int = 2000, **kwargs) -> ToolResult:
        """读取文件"""
        config = self.config or SandboxToolConfig()

        try:
            if config.mode == "docker":
                # 确保容器已启动，路径用列表参数传递（无需 shell 转义）
                await _ensure_container_running(config)
                cmd = [
                    "docker", "exec", config.container_name,
                    "head", "-n", str(max_lines), path,
                ]
                loop = asyncio.get_running_loop()
                result = await loop.run_in_executor(
                    None,
                    lambda: subprocess.run(
                        cmd, capture_output=True, text=True, timeout=30
                    ),
                )
                if result.returncode == 0:
                    return ToolResult.success_result(result.stdout)
                return ToolResult.error_result(result.stderr)
            else:
                with open(path, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                    full_content = "".join(lines)
                    if len(lines) > max_lines:
                        truncated = "".join(lines[:max_lines]) + f"\n...(文件共 {len(lines)} 行，已读取前 {max_lines} 行)"
                    else:
                        truncated = full_content
                    result = ToolResult.success_result(truncated)
                    result.metadata["raw_output"] = full_content
                    return result
        except FileNotFoundError:
            return ToolResult.error_result(f"文件不存在: {path}")
        except Exception as e:
            return ToolResult.error_result(str(e))


class SandboxMCPClient(MCPClientBase[SandboxToolConfig]):
    """沙箱MCP客户端"""
    
    def __init__(self, config: SandboxToolConfig = None):
        super().__init__(config or SandboxToolConfig())
        self._shell_tool: Optional[ShellExecTool] = None
    
    @property
    def client_name(self) -> str:
        return "sandbox"
    
    def _register_tools(self) -> None:
        """注册沙箱工具（精简版）"""
        self._shell_tool = ShellExecTool(self.config)
        self.register_tool(self._shell_tool)
        self.register_tool(FileReadTool(self.config))
    
    @property
    def cwd(self) -> str:
        """当前工作目录"""
        return self._shell_tool._cwd if self._shell_tool else self.config.work_dir


def create_sandbox_tools(config: SandboxToolConfig = None) -> dict:
    """创建沙箱工具函数字典"""
    client = SandboxMCPClient(config)
    client._register_tools()
    
    return {
        "shell_exec": lambda command, workdir=None, timeout=None: client.execute_tool_sync(
            "shell_exec", command=command, workdir=workdir, timeout=timeout
        ).to_json(),
        "file_read": lambda path, max_lines=2000: client.execute_tool_sync(
            "file_read", path=path, max_lines=max_lines
        ).to_json(),
        "get_client": lambda: client
    }
