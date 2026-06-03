import json
import re
import socket
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.config import settings
from app.database import (
    get_workspace,
    get_workspace_deployment,
    list_recent_workspace_deployments,
    update_workspace_deployment,
    update_workspace_index_deployments,
)


SKIPPED_DIRS = {".git", ".venv", "venv", "node_modules", "__pycache__", ".pytest_cache", "dist", "build"}
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


def _write_static_dockerfile(path: Path) -> None:
    _write_dockerfile_ignore(path)
    nginx_conf = (
        STATIC_NGINX_CONF
        .replace("\\", "\\\\")
        .replace("'", "'\"'\"'")
        .replace("\n", "\\n")
    )
    path.write_text(
        "FROM nginx:alpine\n"
        f"RUN printf '%b' '{nginx_conf}' > /etc/nginx/conf.d/default.conf\n"
        "COPY . /usr/share/nginx/html\n",
        encoding="utf-8",
    )


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

    if (workspace_path / "index.html").exists():
        dockerfile = workdir / "static.Dockerfile"
        _write_static_dockerfile(dockerfile)
        return {
            "kind": "dockerfile",
            "projectType": "static_html",
            "contextDir": str(workspace_path),
            "dockerfile": str(dockerfile),
            "containerPort": 80,
            "hostPort": int(config.get("hostPort") or _find_free_port(excluded_ports)),
            "service": "app",
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


def run_workspace_deployment(deployment_id: str) -> None:
    deployment = get_workspace_deployment(deployment_id)
    if not deployment:
        return
    workspace = get_workspace(deployment["workspaceId"])
    if not workspace:
        update_workspace_deployment(deployment_id, status="failed", error="Workspace 不存在", mark_finished=True)
        return
    config = deployment.get("config") or {}
    config = {
        **config,
        "_excludedHostPorts": _recent_workspace_ports(deployment["workspaceId"]),
    }
    try:
        workspace_path = _safe_workspace_path(workspace)
        update_workspace_deployment(
            deployment_id,
            status="running",
            append_logs=f"[deploy] start workspace={workspace['id']} path={workspace_path}",
            mark_started=True,
        )
        plan = _detect_deploy_plan(workspace_path, deployment_id, config)
        if plan.get("status") == "requires_config":
            update_workspace_deployment(
                deployment_id,
                status="requires_config",
                project_type=str(plan.get("config", {}).get("projectType") or ""),
                config={**config, "requiredReason": plan.get("reason")},
                append_logs=f"[deploy] requires_config: {plan.get('reason')}",
                error=str(plan.get("reason") or "requires config"),
                mark_finished=True,
            )
            _sync_deployment_index(workspace["id"])
            return

        update_workspace_deployment(
            deployment_id,
            project_type=str(plan.get("projectType") or ""),
            ports=plan.get("ports") or ({str(plan.get("service") or "app"): plan.get("hostPort")} if plan.get("hostPort") else {}),
            config={**config, "plan": plan},
            append_logs=f"[deploy] plan={json.dumps(plan, ensure_ascii=False)}",
        )

        docker = _docker_cmd()
        container_ids: List[str] = []
        if plan["kind"] == "compose":
            command = [docker, "compose", "-f", plan["composeFile"], "-p", plan["composeProject"], "up", "-d", "--build"]
            code, output = _run_command(command, timeout=settings.DEPLOY_TIMEOUT_SECONDS)
            _append_log(deployment_id, f"$ {' '.join(command)}\n{output}")
            if code != 0:
                raise RuntimeError(output or "docker compose up failed")
            ps_command = [docker, "compose", "-f", plan["composeFile"], "-p", plan["composeProject"], "ps", "-q"]
            _, ps_output = _run_command(ps_command, timeout=60)
            container_ids = [line.strip() for line in ps_output.splitlines() if line.strip()]
        else:
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
            container_ids = [output.strip()] if output.strip() else []

        urls = _service_urls(plan, config)
        updated = update_workspace_deployment(
            deployment_id,
            status="deployed",
            service_urls=urls,
            ports=plan.get("ports") or ({str(plan.get("service") or "app"): plan.get("hostPort")} if plan.get("hostPort") else {}),
            container_ids=container_ids,
            config={**config, "plan": plan},
            append_logs=f"[deploy] deployed urls={json.dumps(urls, ensure_ascii=False)}",
            mark_finished=True,
        )
        if updated:
            _sync_deployment_index(updated["workspaceId"])
    except subprocess.TimeoutExpired as exc:
        update_workspace_deployment(
            deployment_id,
            status="failed",
            error=f"部署命令超时: {exc}",
            append_logs=f"[deploy] timeout: {exc}",
            mark_finished=True,
        )
        _sync_deployment_index(deployment["workspaceId"])
    except Exception as exc:
        update_workspace_deployment(
            deployment_id,
            status="failed",
            error=str(exc),
            append_logs=f"[deploy] failed: {exc}",
            mark_finished=True,
        )
        _sync_deployment_index(deployment["workspaceId"])


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
