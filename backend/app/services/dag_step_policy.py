import fnmatch
from typing import Any, Dict, Iterable, List, Optional


VALID_MUTATION_MODES = {"read", "write", "unknown"}
PLATFORM_RUNTIME_IDS = {"opencode", "codex", "claude_code", "claude-code"}
GLOB_CHARS = ("*", "?", "[")


def safe_path_pattern(value: Any) -> Optional[str]:
    raw = str(value or "").strip().replace("\\", "/")
    if not raw or raw.startswith("/") or raw.startswith("~") or "://" in raw:
        return None
    trailing_slash = raw.endswith("/")
    parts: List[str] = []
    for part in raw.split("/"):
        if part in {"", "."}:
            continue
        if part == "..":
            return None
        parts.append(part)
    if not parts:
        return None
    cleaned = "/".join(parts)
    if trailing_slash and not cleaned.endswith("/"):
        cleaned += "/"
    return cleaned


def normalize_path_patterns(values: Any) -> List[str]:
    if not isinstance(values, list):
        return []
    normalized: List[str] = []
    seen: set[str] = set()
    for item in values:
        path = safe_path_pattern(item)
        if path and path not in seen:
            normalized.append(path)
            seen.add(path)
    return normalized


def _looks_like_path(value: Any) -> bool:
    text = str(value or "").strip().replace("\\", "/")
    if not text or any(char.isspace() for char in text):
        return False
    return "/" in text or "." in text or text.endswith("/") or any(char in text for char in GLOB_CHARS)


def _has_glob(pattern: str) -> bool:
    return any(char in pattern for char in GLOB_CHARS)


def _literal_root(pattern: str) -> str:
    first = pattern.split("/", 1)[0]
    return "" if _has_glob(first) else first


def _is_dir_pattern(pattern: str) -> bool:
    return pattern.endswith("/")


def patterns_overlap(left: str, right: str) -> bool:
    if not left or not right:
        return True
    if _has_glob(left) or _has_glob(right):
        left_root = _literal_root(left)
        right_root = _literal_root(right)
        if left_root and right_root and left_root != right_root:
            return False
        return True
    left_dir = _is_dir_pattern(left)
    right_dir = _is_dir_pattern(right)
    left_clean = left.rstrip("/")
    right_clean = right.rstrip("/")
    if left_clean == right_clean:
        return True
    if left_dir and right.startswith(left):
        return True
    if right_dir and left.startswith(right):
        return True
    return False


def pattern_sets_disjoint(left: Iterable[str], right: Iterable[str]) -> bool:
    left_items = list(left)
    right_items = list(right)
    if not left_items or not right_items:
        return False
    return not any(patterns_overlap(a, b) for a in left_items for b in right_items)


def path_matches_patterns(path: str, patterns: Iterable[str]) -> bool:
    normalized = safe_path_pattern(path)
    if not normalized:
        return False
    for pattern in patterns:
        if not pattern:
            continue
        if _has_glob(pattern):
            if fnmatch.fnmatchcase(normalized, pattern):
                return True
            continue
        if _is_dir_pattern(pattern):
            if normalized.startswith(pattern):
                return True
            continue
        if normalized == pattern:
            return True
    return False


def infer_mutation_mode(step: Dict[str, Any], fallback_prompt: str = "") -> str:
    raw_mode = str(step.get("mutationMode") or "").strip().lower()
    if raw_mode in VALID_MUTATION_MODES:
        return raw_mode
    metadata = step.get("runtimeMetadata") if isinstance(step.get("runtimeMetadata"), dict) else {}
    raw_metadata_mode = str(metadata.get("mutationMode") or "").strip().lower()
    if raw_metadata_mode in VALID_MUTATION_MODES:
        return raw_metadata_mode

    expected_outputs = step.get("expectedOutputs") if isinstance(step.get("expectedOutputs"), list) else []
    task_text = f"{fallback_prompt} {step.get('agentName', '')} {step.get('task', '')}".lower()
    write_markers = (
        "生成", "创建", "新增", "修改", "改造", "修复", "写入", "保存", "实现", "部署",
        "运行命令", "执行命令", "命令", "build", "deploy", "install", "start", "run ",
        "write", "create", "modify", "fix", "implement", "generate",
    )
    read_markers = (
        "只读", "不修改", "不要修改", "review", "code review", "检查", "审查",
        "解释", "说明", "查看", "分析", "建议", "确认",
    )
    if expected_outputs or any(marker in task_text for marker in write_markers):
        return "write"
    if any(marker in task_text for marker in read_markers):
        return "read"
    return "unknown"


def normalize_step_mutation_fields(step: Dict[str, Any], fallback_prompt: str = "") -> Dict[str, Any]:
    mode = infer_mutation_mode(step, fallback_prompt)
    expected_outputs = step.get("expectedOutputs") if isinstance(step.get("expectedOutputs"), list) else []
    target_paths = normalize_path_patterns(step.get("targetPaths"))
    read_paths = normalize_path_patterns(step.get("readPaths"))
    if mode == "write" and not target_paths:
        target_paths = normalize_path_patterns([item for item in expected_outputs if _looks_like_path(item)])
    if mode == "read":
        target_paths = []
    return {
        "mutationMode": mode,
        "targetPaths": target_paths,
        "readPaths": read_paths,
        "usesStableSnapshot": bool(step.get("usesStableSnapshot")),
        "writeToolOnly": bool(step.get("writeToolOnly")),
    }


def _metadata(step: Dict[str, Any]) -> Dict[str, Any]:
    return step.get("runtimeMetadata") if isinstance(step.get("runtimeMetadata"), dict) else {}


def step_mutation_mode(step: Dict[str, Any]) -> str:
    mode = str(step.get("mutationMode") or _metadata(step).get("mutationMode") or "unknown").strip().lower()
    return mode if mode in VALID_MUTATION_MODES else "unknown"


def step_target_paths(step: Dict[str, Any]) -> List[str]:
    paths = step.get("targetPaths")
    if not isinstance(paths, list):
        paths = _metadata(step).get("targetPaths")
    return normalize_path_patterns(paths)


def step_read_paths(step: Dict[str, Any]) -> List[str]:
    paths = step.get("readPaths")
    if not isinstance(paths, list):
        paths = _metadata(step).get("readPaths")
    return normalize_path_patterns(paths)


def step_uses_stable_snapshot(step: Dict[str, Any]) -> bool:
    # The runtime does not yet bind read tools to a materialized snapshot, so this
    # declaration is preserved for API visibility but not trusted for scheduling.
    return False


def step_write_tool_only(step: Dict[str, Any]) -> bool:
    return bool(step.get("writeToolOnly") or _metadata(step).get("writeToolOnly"))


def step_uses_free_runtime(step: Dict[str, Any]) -> bool:
    runtime = str(step.get("runtime") or _metadata(step).get("agentRuntime") or "native").strip().lower()
    return bool(runtime and runtime != "native" and runtime in PLATFORM_RUNTIME_IDS)


def step_whole_workspace_write_lane(step: Dict[str, Any]) -> bool:
    mode = step_mutation_mode(step)
    if mode == "read":
        return False
    if mode == "unknown":
        return True
    if step_uses_free_runtime(step):
        return True
    if not step_write_tool_only(step):
        return True
    return not bool(step_target_paths(step))


def steps_compatible(candidate: Dict[str, Any], running_step: Dict[str, Any]) -> bool:
    candidate_mode = step_mutation_mode(candidate)
    running_mode = step_mutation_mode(running_step)
    if candidate_mode == "read" and running_mode == "read":
        return True
    if candidate_mode == "read" and running_mode != "read":
        if step_uses_stable_snapshot(candidate):
            return True
        if step_whole_workspace_write_lane(running_step):
            return False
        return pattern_sets_disjoint(step_read_paths(candidate), step_target_paths(running_step))
    if candidate_mode != "read" and running_mode == "read":
        if step_uses_stable_snapshot(running_step):
            return True
        if step_whole_workspace_write_lane(candidate):
            return False
        return pattern_sets_disjoint(step_target_paths(candidate), step_read_paths(running_step))
    if step_whole_workspace_write_lane(candidate) or step_whole_workspace_write_lane(running_step):
        return False
    return pattern_sets_disjoint(step_target_paths(candidate), step_target_paths(running_step))
