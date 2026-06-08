from pathlib import PurePosixPath
from typing import Any


SECRET_EXACT_NAMES = {
    ".env",
    "id_rsa",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
}
SECRET_SUFFIXES = {
    ".pem",
    ".key",
    ".p12",
    ".pfx",
    ".crt",
    ".cert",
}
SECRET_DIR_NAMES = {
    ".ssh",
}


def normalize_workspace_relative_path(value: Any) -> str:
    raw = str(value or "").strip().replace("\\", "/")
    if not raw:
        return ""
    path = PurePosixPath(raw)
    if path.is_absolute():
        return ""
    parts = [part for part in path.parts if part not in {"", "."}]
    if not parts or any(part == ".." for part in parts):
        return ""
    return "/".join(parts)


def is_sensitive_workspace_path(value: Any) -> bool:
    path = normalize_workspace_relative_path(value)
    if not path:
        return False
    parts = path.split("/")
    lowered_parts = [part.lower() for part in parts]
    if any(part in SECRET_DIR_NAMES for part in lowered_parts):
        return True
    name = lowered_parts[-1]
    if name in SECRET_EXACT_NAMES or name.startswith(".env."):
        return True
    suffix = PurePosixPath(name).suffix.lower()
    if suffix in SECRET_SUFFIXES:
        return True
    if name.startswith("secrets.") or name.startswith("credentials."):
        return True
    if name.startswith("service-account") and name.endswith(".json"):
        return True
    return False
