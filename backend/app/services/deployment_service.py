import asyncio
import json
import re
import shlex
import socket
import subprocess
import threading
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.config import settings
from app.core.llm_client import client
from app.database import (
    create_message,
    create_workspace_deployment,
    get_connection,
    get_workspace,
    get_workspace_deployment,
    get_workspace_index,
    heartbeat_workspace_mutation_lock,
    is_workspace_mutation_lock_current,
    list_recent_workspace_deployments,
    mutation_queue_position,
    release_workspace_mutation_lock,
    try_acquire_workspace_mutation_lock,
    update_conversation_activity,
    update_workspace_deployment,
    update_workspace_index_deployments,
)
from app.services.workspace_agents_service import read_workspace_agents_context


SKIPPED_DIRS = {".git", ".venv", "venv", "node_modules", "__pycache__", ".pytest_cache", "dist", "build"}
CHAT_DEPLOYMENT_SOURCE = "chatDeployment"
DEFAULT_DEPLOY_MAX_ATTEMPTS = 3
DeployMessageCallback = Callable[[Dict[str, Any]], None]
AUTO_DOCKERIGNORE = """\
.git
.venv
venv
node_modules
__pycache__
.pytest_cache
.mypy_cache
.ruff_cache
dist
build
*.pyc
*.pyo
*.log
"""

DEPLOY_PLANNER_SYSTEM_PROMPT = """你是 AgentHub 的 Deploy Planner。
你只负责根据真实 workspace 上下文生成部署配置 JSON，不执行命令。

安全规则：
- 只能引用 workspace 内真实存在的 projectDir/frontendDir/backendDir。
- startCommand 只能是常见 Web 服务启动命令，例如 npm/pnpm/yarn run、uvicorn、python -m streamlit、flask run。
- 不要输出 shell 重定向、管道、下载命令、删除命令、后台运行符或任意系统管理命令。
- 如果无法确定，请返回 deployable=false 和 clarificationQuestion。

输出 JSON：
{
  "deployable": true,
  "projectType": "node_frontend | python_backend | fullstack_split | static_html | dockerfile | docker_compose",
  "projectDir": ".",
  "frontendDir": "frontend",
  "backendDir": "backend",
  "startCommand": "npm run preview -- --host 0.0.0.0 --port 4173",
  "frontendStartCommand": "",
  "backendStartCommand": "",
  "containerPort": 4173,
  "frontendPort": 4173,
  "backendPort": 8000,
  "reason": "简短说明"
}
"""


def _json_script(path: Path) -> Dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _docker_cmd() -> str:
    return settings.DEPLOY_DOCKER_BIN or "docker"


def _deployment_workdir(deployment_id: str) -> Path:
    root = Path(settings.DEPLOY_WORKDIR_ROOT or "/tmp/agenthub-deployments").resolve()
    path = root / deployment_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def _host_base_url(config: Dict[str, Any]) -> str:
    base_url = str(config.get("publicBaseUrl") or settings.DEPLOY_BASE_URL or "http://localhost").rstrip("/")
    return base_url or "http://localhost"


def _write_dockerfile_ignore(dockerfile_path: Path) -> None:
    dockerfile_path.with_name(f"{dockerfile_path.name}.dockerignore").write_text(
        AUTO_DOCKERIGNORE,
        encoding="utf-8",
    )


def _find_free_port(excluded: Optional[set] = None) -> int:
    excluded = excluded or set()
    start = int(settings.DEPLOY_PORT_MIN or 31000)
    end = int(settings.DEPLOY_PORT_MAX or 39999)
    for port in range(start, end + 1):
        if port in excluded:
            continue
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.05)
            if sock.connect_ex(("127.0.0.1", port)) != 0:
                return port
    raise RuntimeError("没有可用部署端口")


def _config_excluded_ports(config: Dict[str, Any]) -> set:
    raw = config.get("_excludedHostPorts")
    if not isinstance(raw, list):
        return set()
    result = set()
    for item in raw:
        try:
            result.add(int(item))
        except (TypeError, ValueError):
            continue
    return result


def _recent_workspace_ports(workspace_id: str) -> List[int]:
    ports = []
    for deployment in list_recent_workspace_deployments(workspace_id, limit=20):
        port_map = deployment.get("ports") if isinstance(deployment.get("ports"), dict) else {}
        for value in port_map.values():
            try:
                port = int(value)
            except (TypeError, ValueError):
                continue
            if port not in ports:
                ports.append(port)
    return ports


def _run_command(command: List[str], cwd: Optional[Path] = None, timeout: Optional[int] = None) -> Tuple[int, str]:
    proc = subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=timeout or settings.DEPLOY_TIMEOUT_SECONDS,
        check=False,
    )
    return proc.returncode, (proc.stdout or "").strip()


def _append_log(deployment_id: str, message: str) -> None:
    if message:
        update_workspace_deployment(deployment_id, append_logs=message[-20000:])


def request_base_url_from_request(request: Any) -> str:
    hostname = request.url.hostname or "localhost"
    return f"{request.url.scheme}://{hostname}"


def _deployment_message_content(deployment: Dict[str, Any], status: str, error_summary: str = "") -> str:
    status_label = {
        "queued": "部署任务已创建。",
        "running": "部署正在运行。",
        "retrying": "部署失败，正在自动重试。",
        "requires_config": "部署需要补充配置。",
        "deployed": "部署已完成。",
        "failed": "部署失败。",
        "stopped": "部署已停止。",
    }.get(status, f"部署状态：{status}")
    urls = deployment.get("serviceUrls") if isinstance(deployment.get("serviceUrls"), dict) else {}
    if urls and status != "stopped":
        url_text = "，".join(f"{name}: {url}" for name, url in urls.items())
        return f"{status_label}\n预览地址：{url_text}"
    if error_summary:
        return f"{status_label}\n原因：{error_summary[:500]}"
    return status_label


def create_deployment_status_message(
    deployment: Dict[str, Any],
    status: Optional[str] = None,
    error_summary: str = "",
    on_message: Optional[DeployMessageCallback] = None,
) -> Optional[Dict[str, Any]]:
    conversation_id = str(deployment.get("conversationId") or "").strip()
    if not conversation_id:
        return None
    current_status = status or str(deployment.get("status") or "queued")
    config = deployment.get("config") if isinstance(deployment.get("config"), dict) else {}
    attempt = int(config.get("retryAttempt") or 1)
    message = create_message(
        conversation_id=conversation_id,
        sender_id="system",
        sender_name="系统",
        role="system",
        msg_type="status",
        content=_deployment_message_content(deployment, current_status, error_summary),
        metadata={
            "source": CHAT_DEPLOYMENT_SOURCE,
            "deploymentId": deployment.get("id"),
            "workspaceId": deployment.get("workspaceId"),
            "status": current_status,
            "attempt": attempt,
            "maxRetryAttempts": int(config.get("maxRetryAttempts") or DEFAULT_DEPLOY_MAX_ATTEMPTS),
            "projectType": deployment.get("projectType"),
            "serviceUrls": deployment.get("serviceUrls") or {},
            "ports": deployment.get("ports") or {},
            "errorSummary": error_summary,
        },
    )
    update_conversation_activity(conversation_id, message["content"])
    if on_message:
        on_message(message)
    return message


def deployment_status_message_exists(
    conversation_id: str,
    deployment_id: str,
    status: str,
) -> bool:
    conversation_id = str(conversation_id or "").strip()
    deployment_id = str(deployment_id or "").strip()
    status = str(status or "").strip()
    if not conversation_id or not deployment_id or not status:
        return False
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT metadata_json
            FROM messages
            WHERE conversation_id = ?
              AND metadata_json LIKE ?
            ORDER BY created_at DESC
            LIMIT 20
            """,
            (conversation_id, f"%{deployment_id}%"),
        ).fetchall()
    for row in rows:
        try:
            metadata = json.loads(row["metadata_json"] or "{}")
        except json.JSONDecodeError:
            continue
        if (
            metadata.get("source") == CHAT_DEPLOYMENT_SOURCE
            and metadata.get("deploymentId") == deployment_id
            and metadata.get("status") == status
        ):
            return True
    return False


def create_workspace_deployment_request(
    workspace_id: str,
    owner_user_id: str,
    conversation_id: Optional[str] = None,
    run_id: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None,
    public_base_url: Optional[str] = None,
    chat_deployment: bool = False,
    max_retry_attempts: int = DEFAULT_DEPLOY_MAX_ATTEMPTS,
    on_message: Optional[DeployMessageCallback] = None,
) -> Dict[str, Any]:
    next_config = dict(config or {})
    if public_base_url:
        next_config["publicBaseUrl"] = str(public_base_url).rstrip("/")
    try:
        requested_attempts = int(next_config.get("maxRetryAttempts") or max_retry_attempts or DEFAULT_DEPLOY_MAX_ATTEMPTS)
    except (TypeError, ValueError):
        requested_attempts = DEFAULT_DEPLOY_MAX_ATTEMPTS
    next_config["maxRetryAttempts"] = max(1, min(DEFAULT_DEPLOY_MAX_ATTEMPTS, requested_attempts))
    next_config.setdefault("retryAttempt", 1)
    if chat_deployment:
        next_config["chatDeployment"] = True
    deployment = create_workspace_deployment(
        workspace_id=workspace_id,
        owner_user_id=owner_user_id,
        conversation_id=conversation_id,
        run_id=run_id,
        deploy_type="local_docker",
        config=next_config,
    )
    if chat_deployment:
        initial_message = create_deployment_status_message(deployment, "queued", on_message=on_message)
        if initial_message:
            deployment = {**deployment, "initialMessage": initial_message}
    return deployment


def _safe_workspace_path(workspace: Dict[str, Any]) -> Path:
    path = Path(str(workspace.get("workspacePath") or "")).resolve()
    if not path.exists() or not path.is_dir():
        raise FileNotFoundError("workspace 目录不存在")
    return path


def _iter_project_dirs(workspace_path: Path) -> List[Path]:
    dirs = [workspace_path]
    for child in sorted(workspace_path.iterdir(), key=lambda item: item.name):
        if child.is_dir() and child.name not in SKIPPED_DIRS:
            dirs.append(child)
    return dirs


def _find_node_dirs(workspace_path: Path) -> List[Path]:
    return [path for path in _iter_project_dirs(workspace_path) if (path / "package.json").exists()]


def _find_python_dirs(workspace_path: Path) -> List[Path]:
    result = []
    for path in _iter_project_dirs(workspace_path):
        if (path / "requirements.txt").exists() or (path / "pyproject.toml").exists() or (path / "main.py").exists() or (path / "app.py").exists():
            result.append(path)
    return result


def _find_static_html_entry(workspace_path: Path) -> Optional[Tuple[Path, Path]]:
    fallback: Optional[Tuple[Path, Path]] = None
    for path in _iter_project_dirs(workspace_path):
        for filename in ("index.html", "index.htm"):
            target = path / filename
            if target.exists() and target.is_file():
                return path, target
        for child in sorted(path.iterdir(), key=lambda item: item.name):
            if child.is_file() and child.suffix.lower() in {".html", ".htm"}:
                fallback = fallback or (path, child)
    return fallback


def _relative_dir(workspace_path: Path, project_dir: Path) -> str:
    rel = project_dir.relative_to(workspace_path).as_posix()
    return "." if rel == "." else rel


def _extract_exposed_port(dockerfile: Path) -> Optional[int]:
    try:
        content = dockerfile.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    match = re.search(r"(?im)^\s*EXPOSE\s+(\d+)", content)
    return int(match.group(1)) if match else None


def _node_command(package_json: Dict[str, Any], port: int, override: str = "") -> Tuple[str, int]:
    if override:
        return override, port
    scripts = package_json.get("scripts") if isinstance(package_json.get("scripts"), dict) else {}
    if "preview" in scripts:
        return f"npm run build && npm run preview -- --host 0.0.0.0 --port {port or 4173}", port or 4173
    if "start" in scripts:
        return f"HOST=0.0.0.0 PORT={port or 3000} npm run start", port or 3000
    if "dev" in scripts:
        return f"npm run dev -- --host 0.0.0.0 --port {port or 5173}", port or 5173
    return "", port


def _python_command(project_dir: Path, port: int, override: str = "") -> Tuple[str, int]:
    if override:
        return override, port
    for filename in ("main.py", "app.py"):
        target = project_dir / filename
        if not target.exists():
            continue
        content = target.read_text(encoding="utf-8", errors="replace")
        module = target.stem
        if "FastAPI" in content or "fastapi" in content or "Flask" in content or "flask" in content:
            return f"uvicorn {module}:app --host 0.0.0.0 --port {port or 8000}", port or 8000
        if filename == "main.py":
            return "python main.py", port or 8000
    return "", port


def _parse_json_object(text: str) -> Dict[str, Any]:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if not match:
            raise
        return json.loads(match.group(0))


def _manifest_brief(workspace_path: Path) -> str:
    sections: List[str] = []
    for path in _iter_project_dirs(workspace_path)[:12]:
        for filename in ("package.json", "pyproject.toml", "requirements.txt", "Dockerfile", "docker-compose.yml", "docker-compose.yaml"):
            target = path / filename
            if not target.exists() or not target.is_file():
                continue
            try:
                content = target.read_text(encoding="utf-8", errors="replace")[:3000]
            except OSError:
                continue
            sections.append(f"--- {_relative_dir(workspace_path, target.parent)}/{filename} ---\n{content}")
    return "\n\n".join(sections[:20])


def _safe_relative_dir_config(workspace_path: Path, value: Any) -> Optional[str]:
    raw = str(value or "").strip()
    if not raw:
        return None
    candidate = (workspace_path / raw).resolve() if not Path(raw).is_absolute() else Path(raw).resolve()
    try:
        candidate.relative_to(workspace_path)
    except ValueError:
        return None
    if not candidate.exists() or not candidate.is_dir():
        return None
    return _relative_dir(workspace_path, candidate)


def _safe_port(value: Any) -> Optional[int]:
    try:
        port = int(value)
    except (TypeError, ValueError):
        return None
    if 1 <= port <= 65535:
        return port
    return None


def _safe_deploy_command(command: Any) -> Optional[str]:
    text = str(command or "").strip()
    if not text:
        return None
    lowered = text.lower()
    dangerous_markers = (";", "|", ">", "<", "`", "$(", " rm ", "curl ", "wget ", " sudo ", " docker ", " chmod ", " chown ")
    padded = f" {lowered} "
    if any(marker in text or marker in padded for marker in dangerous_markers):
        return None
    allowed_prefixes = (
        "npm run ",
        "pnpm ",
        "yarn ",
        "uvicorn ",
        "python -m uvicorn ",
        "python -m http.server ",
        "python3 -m http.server ",
        "python -m streamlit ",
        "python -m flask ",
        "flask run",
    )
    if lowered.startswith(allowed_prefixes):
        return text
    return None


def _validated_model_deploy_config(workspace_path: Path, payload: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], str]:
    if not isinstance(payload, dict) or payload.get("deployable") is False:
        return None, str(payload.get("clarificationQuestion") or payload.get("reason") or "模型无法确定部署配置")
    config: Dict[str, Any] = {}
    for key in ("projectDir", "frontendDir", "backendDir"):
        safe_dir = _safe_relative_dir_config(workspace_path, payload.get(key))
        if payload.get(key) and not safe_dir:
            return None, f"模型返回了无效目录: {key}"
        if safe_dir:
            config[key] = safe_dir
    for key in ("containerPort", "frontendPort", "backendPort"):
        port = _safe_port(payload.get(key))
        if payload.get(key) and not port:
            return None, f"模型返回了无效端口: {key}"
        if port:
            config[key] = port
    for key in ("startCommand", "frontendStartCommand", "backendStartCommand"):
        command = _safe_deploy_command(payload.get(key))
        if payload.get(key) and not command:
            return None, f"模型返回了不安全或不支持的命令: {key}"
        if command:
            config[key] = command
    config["modelDeployPlan"] = {
        "projectType": payload.get("projectType"),
        "reason": str(payload.get("reason") or "")[:1000],
        "raw": {k: v for k, v in payload.items() if k != "raw"},
    }
    return config, ""


def _model_deploy_config(
    workspace: Dict[str, Any],
    workspace_path: Path,
    previous_error: str = "",
) -> Tuple[Optional[Dict[str, Any]], str]:
    workspace_id = workspace["id"]
    index = get_workspace_index(workspace_id) or {}
    user_content = (
        f"[Workspace]\n"
        f"id={workspace_id}\n"
        f"path={workspace_path}\n\n"
        f"[Workspace Index]\n{json.dumps({k: index.get(k) for k in ('summary', 'tree', 'featureMap', 'deploymentMap')}, ensure_ascii=False)[:12000]}\n\n"
        f"{read_workspace_agents_context(workspace_id)[:12000]}\n\n"
        f"[Manifests]\n{_manifest_brief(workspace_path)[:16000]}\n\n"
        f"[Previous Deploy Error]\n{previous_error[:6000] if previous_error else '无'}"
    )
    try:
        response = client.chat.completions.create(
            model=settings.MODEL_EP,
            messages=[
                {"role": "system", "content": DEPLOY_PLANNER_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            stream=False,
        )
        payload = _parse_json_object(response.choices[0].message.content or "")
    except Exception as exc:
        return None, f"模型部署规划失败: {exc}"
    return _validated_model_deploy_config(workspace_path, payload)


STATIC_NGINX_CONF = (
    "server {\n"
    "    listen 80;\n"
    "    server_name _;\n"
    "    root /usr/share/nginx/html;\n"
    "    index index.html;\n"
    "\n"
    "    add_header Cache-Control \"no-store, no-cache, must-revalidate, proxy-revalidate\" always;\n"
    "    add_header Pragma \"no-cache\" always;\n"
    "    add_header Expires \"0\" always;\n"
    "\n"
    "    location / {\n"
    "        try_files $uri $uri/ /index.html;\n"
    "    }\n"
    "}\n"
)


def _write_static_dockerfile(path: Path, entry_file: str = "index.html") -> None:
    _write_dockerfile_ignore(path)
    nginx_conf = (
        STATIC_NGINX_CONF
        .replace("\\", "\\\\")
        .replace("'", "'\"'\"'")
        .replace("\n", "\\n")
    )
    lines = [
        "FROM nginx:alpine\n"
        f"RUN printf '%b' '{nginx_conf}' > /etc/nginx/conf.d/default.conf\n"
        "COPY . /usr/share/nginx/html\n"
    ]
    if entry_file and entry_file.lower() not in {"index.html", "index.htm"}:
        lines.append(
            "RUN cp "
            f"/usr/share/nginx/html/{shlex.quote(entry_file)} "
            "/usr/share/nginx/html/index.html\n"
        )
    path.write_text("".join(lines), encoding="utf-8")


def _write_node_dockerfile(path: Path, command: str, port: int) -> None:
    _write_dockerfile_ignore(path)
    path.write_text(
        "FROM node:20-alpine\n"
        "WORKDIR /app\n"
        "COPY package*.json ./\n"
        "RUN npm install\n"
        "COPY . .\n"
        f"EXPOSE {port}\n"
        f"CMD [\"sh\", \"-lc\", {json.dumps(command)}]\n",
        encoding="utf-8",
    )


def _write_python_dockerfile(path: Path, command: str, port: int) -> None:
    _write_dockerfile_ignore(path)
    pyproject_dependency_installer = (
        "import subprocess, sys, tomllib; "
        "from pathlib import Path; "
        "data = tomllib.loads(Path('pyproject.toml').read_text(encoding='utf-8')); "
        "deps = data.get('project', {}).get('dependencies') or []; "
        "deps = [str(dep) for dep in deps if str(dep).strip()]; "
        "subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--no-cache-dir', *deps]) if deps else None"
    )
    path.write_text(
        "FROM python:3.11-slim\n"
        "WORKDIR /app\n"
        "ENV PYTHONUNBUFFERED=1\n"
        "COPY . .\n"
        "RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; "
        f"elif [ -f pyproject.toml ]; then python -c {json.dumps(pyproject_dependency_installer)}; fi\n"
        f"EXPOSE {port}\n"
        f"CMD [\"sh\", \"-lc\", {json.dumps(command)}]\n",
        encoding="utf-8",
    )


def _requires_config(reason: str, config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return {
        "status": "requires_config",
        "reason": reason,
        "config": config or {},
    }


def _detect_deploy_plan(workspace_path: Path, deployment_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
    workdir = _deployment_workdir(deployment_id)
    excluded_ports = _config_excluded_ports(config)
    compose_file = next((workspace_path / name for name in ("docker-compose.yml", "docker-compose.yaml", "compose.yml") if (workspace_path / name).exists()), None)
    if compose_file:
        return {
            "kind": "compose",
            "projectType": "docker_compose",
            "composeFile": str(compose_file),
            "composeProject": f"agenthub_{deployment_id.replace('-', '_')}",
            "ports": config.get("ports") if isinstance(config.get("ports"), dict) else {},
        }

    dockerfile = workspace_path / "Dockerfile"
    if dockerfile.exists():
        container_port = int(config.get("containerPort") or _extract_exposed_port(dockerfile) or 0)
        if not container_port:
            return _requires_config("已有 Dockerfile 但无法判断容器端口，请传 containerPort。")
        host_port = int(config.get("hostPort") or _find_free_port(excluded_ports))
        return {
            "kind": "dockerfile",
            "projectType": "dockerfile",
            "contextDir": str(workspace_path),
            "dockerfile": str(dockerfile),
            "containerPort": container_port,
            "hostPort": host_port,
            "service": "app",
        }

    node_dirs = _find_node_dirs(workspace_path)
    python_dirs = _find_python_dirs(workspace_path)
    if node_dirs and python_dirs:
        frontend_dir = Path(config.get("frontendDir") or next((path for path in node_dirs if path.name.lower() in {"frontend", "client", "web"}), node_dirs[0]))
        backend_dir = Path(config.get("backendDir") or next((path for path in python_dirs if path.name.lower() in {"backend", "server", "api"}), python_dirs[0]))
        if not frontend_dir.is_absolute():
            frontend_dir = workspace_path / frontend_dir
        if not backend_dir.is_absolute():
            backend_dir = workspace_path / backend_dir
        frontend_port = int(config.get("frontendPort") or 4173)
        backend_port = int(config.get("backendPort") or 8000)
        frontend_cmd, frontend_port = _node_command(_json_script(frontend_dir / "package.json"), frontend_port, str(config.get("frontendStartCommand") or ""))
        backend_cmd, backend_port = _python_command(backend_dir, backend_port, str(config.get("backendStartCommand") or ""))
        if not frontend_cmd or not backend_cmd:
            return _requires_config("前后端分离项目需要可识别的 frontend/backend 启动命令。")
        frontend_dockerfile = workdir / "frontend.Dockerfile"
        backend_dockerfile = workdir / "backend.Dockerfile"
        _write_node_dockerfile(frontend_dockerfile, frontend_cmd, frontend_port)
        _write_python_dockerfile(backend_dockerfile, backend_cmd, backend_port)
        host_frontend_port = int(config.get("hostFrontendPort") or _find_free_port(excluded_ports))
        host_backend_port = int(config.get("hostBackendPort") or _find_free_port({*excluded_ports, host_frontend_port}))
        compose_path = workdir / "docker-compose.yml"
        compose_path.write_text(
            "services:\n"
            "  frontend:\n"
            f"    build:\n      context: {frontend_dir}\n      dockerfile: {frontend_dockerfile}\n"
            f"    container_name: agenthub-deploy-{deployment_id}-frontend\n"
            f"    ports:\n      - \"{host_frontend_port}:{frontend_port}\"\n"
            "  backend:\n"
            f"    build:\n      context: {backend_dir}\n      dockerfile: {backend_dockerfile}\n"
            f"    container_name: agenthub-deploy-{deployment_id}-backend\n"
            f"    ports:\n      - \"{host_backend_port}:{backend_port}\"\n",
            encoding="utf-8",
        )
        return {
            "kind": "compose",
            "projectType": "fullstack_split",
            "composeFile": str(compose_path),
            "composeProject": f"agenthub_{deployment_id.replace('-', '_')}",
            "ports": {"frontend": host_frontend_port, "backend": host_backend_port},
            "containerPorts": {"frontend": frontend_port, "backend": backend_port},
            "projectDirs": {
                "frontend": _relative_dir(workspace_path, frontend_dir),
                "backend": _relative_dir(workspace_path, backend_dir),
            },
        }

    if node_dirs:
        project_dir = Path(config.get("projectDir") or node_dirs[0])
        if not project_dir.is_absolute():
            project_dir = workspace_path / project_dir
        container_port = int(config.get("containerPort") or 4173)
        command, container_port = _node_command(_json_script(project_dir / "package.json"), container_port, str(config.get("startCommand") or ""))
        if not command:
            return _requires_config("Node 项目缺少可识别 start/dev/preview 脚本，请传 startCommand。")
        dockerfile = workdir / "node.Dockerfile"
        _write_node_dockerfile(dockerfile, command, container_port)
        return {
            "kind": "dockerfile",
            "projectType": "node_frontend",
            "contextDir": str(project_dir),
            "dockerfile": str(dockerfile),
            "containerPort": container_port,
            "hostPort": int(config.get("hostPort") or _find_free_port(excluded_ports)),
            "service": "app",
            "projectDir": _relative_dir(workspace_path, project_dir),
        }

    if python_dirs:
        project_dir = Path(config.get("projectDir") or python_dirs[0])
        if not project_dir.is_absolute():
            project_dir = workspace_path / project_dir
        container_port = int(config.get("containerPort") or 8000)
        command, container_port = _python_command(project_dir, container_port, str(config.get("startCommand") or ""))
        if not command or command == "python main.py":
            return _requires_config("Python 项目缺少明确 Web 服务启动方式，请传 startCommand 和 containerPort。")
        dockerfile = workdir / "python.Dockerfile"
        _write_python_dockerfile(dockerfile, command, container_port)
        return {
            "kind": "dockerfile",
            "projectType": "python_backend",
            "contextDir": str(project_dir),
            "dockerfile": str(dockerfile),
            "containerPort": container_port,
            "hostPort": int(config.get("hostPort") or _find_free_port(excluded_ports)),
            "service": "app",
            "projectDir": _relative_dir(workspace_path, project_dir),
        }

    static_entry = _find_static_html_entry(workspace_path)
    if static_entry:
        static_dir, static_file = static_entry
        dockerfile = workdir / "static.Dockerfile"
        _write_static_dockerfile(dockerfile, static_file.name)
        return {
            "kind": "dockerfile",
            "projectType": "static_html",
            "contextDir": str(static_dir),
            "dockerfile": str(dockerfile),
            "containerPort": 80,
            "hostPort": int(config.get("hostPort") or _find_free_port(excluded_ports)),
            "service": "app",
            "projectDir": _relative_dir(workspace_path, static_dir),
            "entryFile": static_file.name,
        }

    return _requires_config("无法识别可部署项目，请提供 startCommand/containerPort 或 Dockerfile/docker-compose.yml。")


def _service_urls(plan: Dict[str, Any], config: Dict[str, Any]) -> Dict[str, str]:
    base_url = _host_base_url(config)
    ports = plan.get("ports") if isinstance(plan.get("ports"), dict) else {}
    if plan.get("kind") == "dockerfile" and plan.get("hostPort"):
        return {str(plan.get("service") or "app"): f"{base_url}:{plan['hostPort']}"}
    return {name: f"{base_url}:{port}" for name, port in ports.items() if port}


def _sync_deployment_index(workspace_id: str) -> None:
    deployments = list_recent_workspace_deployments(workspace_id, limit=5)
    if not deployments:
        update_workspace_index_deployments(workspace_id, {})
        return
    latest = deployments[0]
    deployment_map = {
        "latest": {
            "deploymentId": latest.get("id"),
            "status": latest.get("status"),
            "deployType": latest.get("deployType"),
            "projectType": latest.get("projectType"),
            "serviceUrls": latest.get("serviceUrls") or {},
            "ports": latest.get("ports") or {},
            "updatedAt": latest.get("updatedAt"),
        },
        "recent": [
            {
                "deploymentId": item.get("id"),
                "status": item.get("status"),
                "projectType": item.get("projectType"),
                "serviceUrls": item.get("serviceUrls") or {},
                "updatedAt": item.get("updatedAt"),
            }
            for item in deployments
        ],
    }
    update_workspace_index_deployments(workspace_id, deployment_map)


def _plan_ports(plan: Dict[str, Any]) -> Dict[str, Any]:
    return plan.get("ports") or ({str(plan.get("service") or "app"): plan.get("hostPort")} if plan.get("hostPort") else {})


def _is_port_conflict_error(error: str) -> bool:
    lowered = (error or "").lower()
    return any(
        marker in lowered
        for marker in (
            "port is already allocated",
            "bind: address already in use",
            "address already in use",
            "port already allocated",
            "ports are not available",
        )
    )


def _drop_host_port_config(config: Dict[str, Any]) -> Dict[str, Any]:
    next_config = dict(config)
    for key in ("hostPort", "hostFrontendPort", "hostBackendPort", "ports"):
        next_config.pop(key, None)
    return next_config


def _detect_deploy_plan_with_model_fallback(
    workspace: Dict[str, Any],
    workspace_path: Path,
    deployment_id: str,
    config: Dict[str, Any],
    previous_error: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    plan = _detect_deploy_plan(workspace_path, deployment_id, config)
    if plan.get("status") != "requires_config":
        return plan, config
    model_config, model_error = _model_deploy_config(workspace, workspace_path, previous_error or str(plan.get("reason") or ""))
    if not model_config:
        return _requires_config(model_error or str(plan.get("reason") or "requires config")), {
            **config,
            "requiredReason": model_error or plan.get("reason"),
        }
    next_config = {**config, **model_config}
    retry_plan = _detect_deploy_plan(workspace_path, deployment_id, next_config)
    if retry_plan.get("status") == "requires_config":
        return _requires_config(str(retry_plan.get("reason") or "模型部署计划仍需补充配置")), {
            **next_config,
            "requiredReason": retry_plan.get("reason"),
        }
    return retry_plan, next_config


def _execute_deploy_plan(deployment_id: str, plan: Dict[str, Any]) -> List[str]:
    docker = _docker_cmd()
    if plan["kind"] == "compose":
        command = [docker, "compose", "-f", plan["composeFile"], "-p", plan["composeProject"], "up", "-d", "--build"]
        code, output = _run_command(command, timeout=settings.DEPLOY_TIMEOUT_SECONDS)
        _append_log(deployment_id, f"$ {' '.join(command)}\n{output}")
        if code != 0:
            raise RuntimeError(output or "docker compose up failed")
        ps_command = [docker, "compose", "-f", plan["composeFile"], "-p", plan["composeProject"], "ps", "-q"]
        _, ps_output = _run_command(ps_command, timeout=60)
        return [line.strip() for line in ps_output.splitlines() if line.strip()]

    image = f"agenthub-deploy:{deployment_id}"
    container_name = f"agenthub-deploy-{deployment_id}"
    build_command = [docker, "build", "-t", image, "-f", plan["dockerfile"], plan["contextDir"]]
    code, output = _run_command(build_command, timeout=settings.DEPLOY_TIMEOUT_SECONDS)
    _append_log(deployment_id, f"$ {' '.join(build_command)}\n{output}")
    if code != 0:
        raise RuntimeError(output or "docker build failed")
    _run_command([docker, "rm", "-f", container_name], timeout=30)
    run_command = [
        docker,
        "run",
        "-d",
        "--rm",
        "--name",
        container_name,
        "-p",
        f"{plan['hostPort']}:{plan['containerPort']}",
        image,
    ]
    code, output = _run_command(run_command, timeout=120)
    _append_log(deployment_id, f"$ {' '.join(run_command)}\n{output}")
    if code != 0:
        raise RuntimeError(output or "docker run failed")
    return [output.strip()] if output.strip() else []


def _schedule_next_owner_from_thread(next_owner: Optional[Dict[str, Any]]) -> None:
    if not next_owner:
        return
    owner_type = next_owner.get("ownerType")
    owner_id = str(next_owner.get("ownerId") or "")
    if not owner_id:
        return
    if owner_type == "run":
        def start_run() -> None:
            from app.services.run_service import start_queued_agent_run

            asyncio.run(start_queued_agent_run(owner_id))

        threading.Thread(target=start_run, daemon=True).start()
    elif owner_type == "deployment":
        threading.Thread(target=run_workspace_deployment, args=(owner_id,), daemon=True).start()


def run_workspace_deployment(deployment_id: str, on_message: Optional[DeployMessageCallback] = None) -> None:
    deployment = get_workspace_deployment(deployment_id)
    if not deployment:
        return
    workspace_id = str(deployment.get("workspaceId") or "")
    if not workspace_id:
        return
    lock_result = try_acquire_workspace_mutation_lock(
        workspace_id=workspace_id,
        owner_type="deployment",
        owner_id=deployment_id,
        mode="deploy",
    )
    if not lock_result.get("acquired"):
        updated = update_workspace_deployment(
            deployment_id,
            status="queued",
            queued_reason="workspace_mutation_lock_held",
        )
        if updated:
            updated = {
                **updated,
                "queuePosition": lock_result.get("queuePosition") or mutation_queue_position(workspace_id, "deployment", deployment_id),
            }
            create_deployment_status_message(updated, "queued", "", on_message)
        return

    stop_heartbeat = threading.Event()
    lock = lock_result.get("lock") or {}
    fencing_token = int(lock.get("fencingToken") or 0)

    def heartbeat_loop() -> None:
        while not stop_heartbeat.wait(30):
            ok = heartbeat_workspace_mutation_lock(
                workspace_id,
                "deployment",
                deployment_id,
                fencing_token,
            )
            if not ok:
                _append_log(deployment_id, "[deploy] mutation lock heartbeat lost")
                break

    heartbeat_thread = threading.Thread(target=heartbeat_loop, daemon=True)
    heartbeat_thread.start()
    try:
        _run_workspace_deployment_locked(deployment_id, fencing_token, on_message)
    finally:
        stop_heartbeat.set()
        heartbeat_thread.join(timeout=2)
        release_result = release_workspace_mutation_lock(
            workspace_id,
            "deployment",
            deployment_id,
            fencing_token,
        )
        if release_result.get("released"):
            update_workspace_deployment(
                deployment_id,
                queued_reason="",
                lock_owner_id="",
                lock_fencing_token=0,
            )
        _schedule_next_owner_from_thread(release_result.get("nextOwner"))


def _run_workspace_deployment_locked(
    deployment_id: str,
    fencing_token: int,
    on_message: Optional[DeployMessageCallback] = None,
) -> None:
    deployment = get_workspace_deployment(deployment_id)
    if not deployment:
        return
    workspace = get_workspace(deployment["workspaceId"])
    if not workspace:
        updated = update_workspace_deployment(deployment_id, status="failed", error="Workspace 不存在", mark_finished=True)
        if updated:
            create_deployment_status_message(updated, "failed", "Workspace 不存在", on_message)
        return
    config = deployment.get("config") or {}
    previous_errors = list(config.get("previousErrors") or []) if isinstance(config.get("previousErrors"), list) else []
    max_attempts = max(1, min(DEFAULT_DEPLOY_MAX_ATTEMPTS, int(config.get("maxRetryAttempts") or DEFAULT_DEPLOY_MAX_ATTEMPTS)))
    base_excluded_ports = set(_recent_workspace_ports(deployment["workspaceId"]))

    try:
        workspace_path = _safe_workspace_path(workspace)
    except Exception as exc:
        updated = update_workspace_deployment(deployment_id, status="failed", error=str(exc), mark_finished=True)
        if updated:
            create_deployment_status_message(updated, "failed", str(exc), on_message)
        _sync_deployment_index(deployment["workspaceId"])
        return

    final_error = ""
    for attempt in range(1, max_attempts + 1):
        if not is_workspace_mutation_lock_current(deployment["workspaceId"], "deployment", deployment_id, fencing_token):
            final_error = "workspace mutation lock lost during deployment"
            break
        attempt_config = {
            **config,
            "retryAttempt": attempt,
            "maxRetryAttempts": max_attempts,
            "previousErrors": previous_errors,
            "_excludedHostPorts": sorted(base_excluded_ports),
        }
        status = "running" if attempt == 1 else "retrying"
        updated = update_workspace_deployment(
            deployment_id,
            status=status,
            config=attempt_config,
            append_logs=f"[deploy] attempt {attempt}/{max_attempts} workspace={workspace['id']} path={workspace_path}",
            mark_started=True,
        )
        if updated:
            create_deployment_status_message(updated, status, previous_errors[-1] if previous_errors else "", on_message)

        try:
            plan, planned_config = _detect_deploy_plan_with_model_fallback(
                workspace,
                workspace_path,
                deployment_id,
                attempt_config,
                previous_errors[-1] if previous_errors else "",
            )
            if plan.get("status") == "requires_config":
                reason = str(plan.get("reason") or planned_config.get("requiredReason") or "requires config")
                updated = update_workspace_deployment(
                    deployment_id,
                    status="requires_config",
                    project_type=str(plan.get("config", {}).get("projectType") or ""),
                    config={**planned_config, "requiredReason": reason},
                    append_logs=f"[deploy] requires_config: {reason}",
                    error=reason,
                    mark_finished=True,
                )
                if updated:
                    create_deployment_status_message(updated, "requires_config", reason, on_message)
                    _sync_deployment_index(updated["workspaceId"])
                return

            update_workspace_deployment(
                deployment_id,
                project_type=str(plan.get("projectType") or ""),
                ports=_plan_ports(plan),
                config={**planned_config, "plan": plan},
                append_logs=f"[deploy] plan={json.dumps(plan, ensure_ascii=False)}",
            )
            if not is_workspace_mutation_lock_current(deployment["workspaceId"], "deployment", deployment_id, fencing_token):
                raise RuntimeError("workspace mutation lock lost before deploy execution")
            container_ids = _execute_deploy_plan(deployment_id, plan)
            if not is_workspace_mutation_lock_current(deployment["workspaceId"], "deployment", deployment_id, fencing_token):
                raise RuntimeError("workspace mutation lock lost before deploy finalization")
            urls = _service_urls(plan, planned_config)
            updated = update_workspace_deployment(
                deployment_id,
                status="deployed",
                service_urls=urls,
                ports=_plan_ports(plan),
                container_ids=container_ids,
                config={**planned_config, "plan": plan, "retryAttempt": attempt, "maxRetryAttempts": max_attempts, "previousErrors": previous_errors},
                append_logs=f"[deploy] deployed urls={json.dumps(urls, ensure_ascii=False)}",
                error="",
                mark_finished=True,
            )
            if updated:
                create_deployment_status_message(updated, "deployed", "", on_message)
                _sync_deployment_index(updated["workspaceId"])
            return
        except subprocess.TimeoutExpired as exc:
            final_error = f"部署命令超时: {exc}"
        except Exception as exc:
            final_error = str(exc)

        previous_errors.append(final_error)
        _append_log(deployment_id, f"[deploy] attempt {attempt} failed: {final_error}")
        if _is_port_conflict_error(final_error):
            config = _drop_host_port_config(config)
            base_excluded_ports.update(
                int(port)
                for port in (_plan_ports((get_workspace_deployment(deployment_id) or {}).get("config", {}).get("plan", {})) or {}).values()
                if str(port).isdigit()
            )
            continue
        if attempt < max_attempts:
            model_config, model_error = _model_deploy_config(workspace, workspace_path, final_error)
            if model_config:
                config = {**config, **model_config, "modelRetryPlan": model_config.get("modelDeployPlan")}
                continue
            previous_errors.append(model_error)
            final_error = model_error
        break

    updated = update_workspace_deployment(
        deployment_id,
        status="failed",
        config={**config, "retryAttempt": min(len(previous_errors) + 1, max_attempts), "maxRetryAttempts": max_attempts, "previousErrors": previous_errors},
        error=final_error,
        append_logs=f"[deploy] failed after retries: {final_error}",
        mark_finished=True,
    )
    if updated:
        create_deployment_status_message(updated, "failed", final_error, on_message)
        _sync_deployment_index(updated["workspaceId"])


def stop_workspace_deployment(deployment_id: str) -> Optional[Dict[str, Any]]:
    deployment = get_workspace_deployment(deployment_id)
    if not deployment:
        return None
    docker = _docker_cmd()
    logs = []
    config = deployment.get("config") or {}
    plan = config.get("plan") if isinstance(config.get("plan"), dict) else {}
    if plan.get("kind") == "compose" and plan.get("composeFile") and plan.get("composeProject"):
        command = [docker, "compose", "-f", plan["composeFile"], "-p", plan["composeProject"], "down"]
        code, output = _run_command(command, timeout=120)
        logs.append(f"$ {' '.join(command)}\n{output}")
        if code != 0:
            logs.append(f"[deploy] docker compose down failed code={code}")
    else:
        for container_id in deployment.get("containerIds") or []:
            command = [docker, "stop", str(container_id)]
            code, output = _run_command(command, timeout=60)
            logs.append(f"$ {' '.join(command)}\n{output}")
            if code != 0:
                logs.append(f"[deploy] docker stop failed container={container_id} code={code}")
    updated = update_workspace_deployment(
        deployment_id,
        status="stopped",
        append_logs="\n".join(logs + ["[deploy] stopped"]),
        mark_finished=True,
    )
    if updated:
        _sync_deployment_index(updated["workspaceId"])
    return updated


def collect_workspace_deployment_logs(deployment_id: str) -> Optional[Dict[str, Any]]:
    deployment = get_workspace_deployment(deployment_id)
    if not deployment:
        return None
    docker = _docker_cmd()
    live_logs = []
    for container_id in deployment.get("containerIds") or []:
        code, output = _run_command([docker, "logs", "--tail", "200", str(container_id)], timeout=30)
        if output:
            live_logs.append(f"[container {str(container_id)[:12]}]\n{output}")
        elif code != 0:
            live_logs.append(f"[container {str(container_id)[:12]}] docker logs failed code={code}")
    return {
        "deploymentId": deployment_id,
        "logs": deployment.get("logs") or "",
        "liveLogs": "\n\n".join(live_logs),
    }
