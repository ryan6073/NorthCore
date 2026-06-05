import asyncio
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.config import settings
from app.core.llm_client import client
from app.database import (
    get_agent_run,
    get_artifact,
    get_sandbox_file_by_artifact,
    get_sandbox_file_version,
    get_workspace,
    get_workspace_index,
    list_artifacts,
    list_artifacts_for_workspace,
    list_recent_workspace_deployments,
    list_sandbox_files_changed_by_run,
    list_sandbox_files_for_workspace,
    mark_workspace_index_stale,
    upsert_workspace_index,
)

WORKSPACE_ACTION_CONFIDENCE_THRESHOLD = 0.75
WORKSPACE_INDEX_MAX_RECENT_CHANGES = 30
WORKSPACE_AGENTS_FILENAME = "AGENTS.md"

WORKSPACE_INDEX_SYSTEM_PROMPT = """你是 AgentHub 的 Workspace Index 摘要器。
后端会提供真实文件树、Artifact 映射和最近变更。你只负责生成简短 summary 和 featureMap 候选。
不要编造不存在的文件路径或 artifactId。只输出 JSON。
格式：
{
  "summary": "一句话概括当前工作区",
  "featureMap": {
    "功能名": {
      "description": "功能职责",
      "files": ["真实存在的相对路径"],
      "entryFiles": ["功能入口或主要实现文件"],
      "testFiles": ["测试文件"],
      "configFiles": ["配置文件"],
      "styleFiles": ["样式文件"],
      "runtimeFiles": ["运行时依赖文件"],
      "artifacts": ["真实存在的 artifactId"]
    }
  }
}
"""

WORKSPACE_ACTION_RESOLVER_PROMPT = """你是 AgentHub 的 Workspace Action Resolver。
你的任务是判断用户当前消息属于：
- create_new：创建新文件/新产物/新功能
- modify_existing：修改已有功能、已有文件或已有产物
- answer_only：只需要解释/问答，不需要修改文件
- clarify：用户表达不清，需要澄清

只能使用候选文件、Artifact 和 Workspace Index 中真实存在的信息。不要编造路径或 artifactId。
如果要修改已有内容，必须给出 targetFiles 或 targetArtifacts，并给出 candidateTargets。
如果用户明确提到某个功能，且 Workspace Index 的 featureMap 能唯一匹配该功能，可以返回多个 targetFiles/allowedRelatedFiles。
同一 feature 下的多个文件不是歧义；只有多个 feature 或多个互不相关候选都合理时才返回 clarify。
targetFiles 放核心实现文件；allowedRelatedFiles 放同一功能下可能需要一起读取或修改的测试、样式、配置、入口文件。
只输出 JSON。
格式：
{
  "action": "create_new | modify_existing | answer_only | clarify",
  "confidence": 0.0,
  "targetFiles": ["path/to/file"],
  "allowedRelatedFiles": ["path/to/related"],
  "targetArtifacts": ["artifact-xxx"],
  "candidateTargets": [
    {"kind": "file | artifact | feature", "id": "artifact-xxx", "path": "path", "title": "标题", "reason": "原因"}
  ],
  "clarificationQuestion": "需要澄清时的问题",
  "reason": "简短理由"
}
"""

FEATURE_FILE_KEYS = ("files", "entryFiles", "testFiles", "configFiles", "styleFiles", "runtimeFiles")
FEATURE_CORE_FILE_KEYS = ("entryFiles", "runtimeFiles", "files")
MODIFY_EXISTING_MARKERS = (
    "修改", "改", "改成", "改为", "替换", "更新", "调整", "修复", "不要", "换成", "补测试",
    "优化", "完善", "增强", "改进", "补全", "区分",
    "modify", "change", "replace", "update", "fix", "edit", "test", "optimize", "improve",
)


def _is_workspace_agents_file(path: Optional[str]) -> bool:
    return str(path or "").strip().replace("\\", "/") == WORKSPACE_AGENTS_FILENAME


def _business_files(files: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [file_meta for file_meta in files if not _is_workspace_agents_file(file_meta.get("path"))]


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


def _safe_relative_path(path: str) -> Optional[str]:
    cleaned = (path or "").strip().replace("\\", "/")
    if not cleaned or cleaned.startswith("/") or ".." in Path(cleaned).parts:
        return None
    return cleaned


def _unique_list(values: List[str]) -> List[str]:
    seen = set()
    result = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result


def _looks_like_modify_existing(user_content: str) -> bool:
    normalized = (user_content or "").strip().lower()
    return any(marker in user_content or marker in normalized for marker in MODIFY_EXISTING_MARKERS)


def _feature_files(feature: Dict[str, Any]) -> List[str]:
    paths: List[str] = []
    for key in FEATURE_FILE_KEYS:
        for path in feature.get(key) or []:
            safe_path = _safe_relative_path(str(path or ""))
            if safe_path:
                paths.append(safe_path)
    return _unique_list(paths)


def _feature_artifacts(feature: Dict[str, Any]) -> List[str]:
    return _unique_list([str(item or "").strip() for item in feature.get("artifacts") or [] if str(item or "").strip()])


def _is_supporting_file(path: str) -> bool:
    lowered = path.lower()
    parts = set(Path(lowered).parts)
    suffix = Path(lowered).suffix
    return (
        "test" in lowered
        or "spec" in lowered
        or "__tests__" in parts
        or suffix in {".css", ".scss", ".sass", ".less", ".json", ".toml", ".yaml", ".yml", ".ini"}
    )


def _feature_core_files(feature: Dict[str, Any], existing_files: Dict[str, Dict[str, Any]]) -> List[str]:
    for key in ("entryFiles", "runtimeFiles"):
        paths = [path for path in (_safe_relative_path(str(item or "")) for item in feature.get(key) or []) if path in existing_files]
        if paths:
            return _unique_list(paths)
    files = [path for path in _feature_files(feature) if path in existing_files]
    core = [path for path in files if not _is_supporting_file(path)]
    return _unique_list(core or files)


def _normalize_feature_map(
    raw_feature_map: Dict[str, Any],
    existing_paths: set,
    existing_artifacts: set,
) -> Dict[str, Any]:
    feature_map: Dict[str, Any] = {}
    for name, item in raw_feature_map.items():
        if not isinstance(item, dict):
            continue
        normalized: Dict[str, Any] = {
            "description": str(item.get("description") or "")[:1000],
        }
        all_files: List[str] = []
        for key in FEATURE_FILE_KEYS:
            paths = [
                path
                for path in (_safe_relative_path(str(raw_path or "")) for raw_path in item.get(key) or [])
                if path in existing_paths
            ]
            if paths:
                normalized[key] = _unique_list(paths)
                all_files.extend(paths)
        artifacts = [artifact_id for artifact_id in _feature_artifacts(item) if artifact_id in existing_artifacts]
        if artifacts:
            normalized["artifacts"] = artifacts
        if all_files and "files" not in normalized:
            normalized["files"] = _unique_list(all_files)
        if not any(normalized.get(key) for key in FEATURE_FILE_KEYS) and not artifacts:
            continue
        feature_map[str(name)[:80]] = normalized
    return feature_map


def _artifact_meta(artifact: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in artifact.items() if k not in {"content", "currentVersion"}}


def _build_tree(files: List[Dict[str, Any]]) -> Dict[str, Any]:
    root: Dict[str, Any] = {"name": "workspace", "type": "directory", "children": []}
    directories: Dict[str, Dict[str, Any]] = {"": root}
    for file_meta in sorted(files, key=lambda item: str(item.get("path") or "")):
        path = _safe_relative_path(str(file_meta.get("path") or ""))
        if not path or _is_workspace_agents_file(path):
            continue
        parent = root
        current = ""
        parts = [part for part in path.split("/") if part]
        for part in parts[:-1]:
            current = f"{current}/{part}" if current else part
            node = directories.get(current)
            if not node:
                node = {"name": part, "type": "directory", "path": current, "children": []}
                parent["children"].append(node)
                directories[current] = node
            parent = node
        parent["children"].append({
            "name": parts[-1],
            "type": "file",
            "path": path,
            "version": file_meta.get("currentVersion"),
            "hash": file_meta.get("contentHash"),
            "artifactId": file_meta.get("artifactId"),
            "mimeType": file_meta.get("mimeType"),
            "size": file_meta.get("size"),
            "sha256": file_meta.get("sha256"),
            "isText": file_meta.get("isText"),
            "contentPreview": file_meta.get("contentPreview"),
        })

    def sort_children(node: Dict[str, Any]) -> None:
        children = node.get("children") or []
        children.sort(key=lambda item: (item.get("type") != "directory", item.get("name", "")))
        for child in children:
            if child.get("type") == "directory":
                sort_children(child)

    sort_children(root)
    return root


def _build_artifact_map(workspace_id: str, conversation_id: str, files: List[Dict[str, Any]]) -> Dict[str, Any]:
    artifact_map: Dict[str, Any] = {}
    for file_meta in files:
        if _is_workspace_agents_file(file_meta.get("path")):
            continue
        artifact_id = file_meta.get("artifactId")
        if not artifact_id:
            continue
        artifact = get_artifact(artifact_id)
        if not artifact:
            continue
        artifact_workspace_id = str(artifact.get("workspaceId") or "").strip()
        if artifact_workspace_id:
            if artifact_workspace_id != workspace_id:
                continue
        elif artifact.get("conversationId") != conversation_id:
            continue
        version = get_sandbox_file_version(file_meta["id"], file_meta.get("currentVersion"))
        artifact_map[artifact_id] = {
            "artifactId": artifact_id,
            "title": artifact.get("title"),
            "type": artifact.get("type"),
            "latestVersion": artifact.get("latestVersion"),
            "currentVersionId": artifact.get("currentVersionId"),
            "filePath": file_meta.get("path"),
            "fileVersion": file_meta.get("currentVersion"),
            "fileHash": file_meta.get("contentHash"),
            "sourceFileVersionId": version.get("id") if version else None,
        }
    return artifact_map


def _build_deployment_map(workspace_id: str) -> Dict[str, Any]:
    deployments = list_recent_workspace_deployments(workspace_id, limit=5)
    if not deployments:
        return {}
    latest = deployments[0]
    return {
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


def _build_recent_changes(
    previous: Optional[Dict[str, Any]],
    run_id: str,
    changed_files: List[Dict[str, Any]],
    artifact_changes: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    old_items = list((previous or {}).get("recentChanges") or [])
    item = {
        "runId": run_id,
        "files": [
            {
                "path": file_meta.get("path"),
                "version": file_meta.get("currentVersion"),
                "hash": file_meta.get("contentHash"),
                "artifactId": file_meta.get("artifactId"),
            }
            for file_meta in changed_files
        ],
        "artifactChanges": artifact_changes,
    }
    return ([item] + old_items)[:WORKSPACE_INDEX_MAX_RECENT_CHANGES]


def _validate_index_payload(
    workspace_id: str,
    conversation_id: str,
    tree: Dict[str, Any],
    artifact_map: Dict[str, Any],
    recent_changes: List[Dict[str, Any]],
) -> None:
    files = {item["path"]: item for item in list_sandbox_files_for_workspace(workspace_id)}
    artifact_ids = set(artifact_map.keys())

    def validate_path(path: str) -> None:
        if path not in files:
            raise ValueError(f"workspace index path 不存在: {path}")

    def walk(node: Dict[str, Any]) -> None:
        if node.get("type") == "file" and node.get("path"):
            validate_path(str(node["path"]))
        for child in node.get("children") or []:
            if isinstance(child, dict):
                walk(child)

    walk(tree)
    for artifact_id, item in artifact_map.items():
        artifact = get_artifact(artifact_id)
        artifact_workspace_id = str((artifact or {}).get("workspaceId") or "").strip()
        if not artifact or (
            artifact_workspace_id
            and artifact_workspace_id != workspace_id
        ) or (
            not artifact_workspace_id
            and artifact.get("conversationId") != conversation_id
        ):
            raise ValueError(f"artifact 不属于当前 Workspace: {artifact_id}")
        file_path = item.get("filePath")
        if file_path:
            validate_path(str(file_path))
        file_version = item.get("fileVersion")
        file_meta = files.get(str(file_path or ""))
        if file_meta and file_version:
            version = get_sandbox_file_version(file_meta["id"], int(file_version))
            if not version:
                raise ValueError(f"文件版本不存在: {file_path} v{file_version}")
    for change in recent_changes:
        for file_item in change.get("files") or []:
            path = file_item.get("path")
            if path:
                validate_path(str(path))
        for artifact_change in change.get("artifactChanges") or []:
            artifact = artifact_change.get("artifact") or {}
            artifact_id = artifact.get("id") or artifact_change.get("artifactId")
            if artifact_id and artifact_id not in artifact_ids:
                artifact_obj = get_artifact(str(artifact_id))
                artifact_workspace_id = str((artifact_obj or {}).get("workspaceId") or "").strip()
                if not artifact_obj or (
                    artifact_workspace_id
                    and artifact_workspace_id != workspace_id
                ) or (
                    not artifact_workspace_id
                    and artifact_obj.get("conversationId") != conversation_id
                ):
                    raise ValueError(f"recentChanges artifact 无效: {artifact_id}")


async def _summarize_workspace_index(
    workspace_id: str,
    tree: Dict[str, Any],
    artifact_map: Dict[str, Any],
    recent_changes: List[Dict[str, Any]],
    existing_index: Optional[Dict[str, Any]],
) -> Tuple[str, Dict[str, Any]]:
    files = _business_files(list_sandbox_files_for_workspace(workspace_id))
    existing_paths = {file_meta["path"] for file_meta in files}
    existing_artifacts = set(artifact_map.keys())
    prompt = json.dumps(
        {
            "previousSummary": (existing_index or {}).get("summary") or "",
            "tree": tree,
            "artifactMap": artifact_map,
            "recentChanges": recent_changes[:5],
        },
        ensure_ascii=False,
    )
    try:
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=settings.MODEL_EP,
            messages=[
                {"role": "system", "content": WORKSPACE_INDEX_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            stream=False,
        )
        payload = _parse_json_object(response.choices[0].message.content or "")
    except Exception as exc:
        raise ValueError(f"workspace index LLM 摘要失败: {exc}")
    summary = str(payload.get("summary") or "").strip()[:4000]
    raw_feature_map = payload.get("featureMap") if isinstance(payload.get("featureMap"), dict) else {}
    feature_map = _normalize_feature_map(raw_feature_map, existing_paths, existing_artifacts)
    if not summary:
        summary = f"工作区包含 {len(files)} 个已跟踪文件、{len(artifact_map)} 个 Artifact 映射。"
    return summary, feature_map


async def rebuild_workspace_index_for_run(run_id: str, artifact_changes: Optional[List[Dict[str, Any]]] = None) -> Optional[Dict[str, Any]]:
    run = get_agent_run(run_id)
    if not run or not run.get("workspaceId"):
        return None
    workspace_id = run["workspaceId"]
    conversation_id = run["conversationId"]
    try:
        files = _business_files(list_sandbox_files_for_workspace(workspace_id))
        tree = _build_tree(files)
        artifact_map = _build_artifact_map(workspace_id, conversation_id, files)
        deployment_map = _build_deployment_map(workspace_id)
        existing_index = get_workspace_index(workspace_id)
        changed_files = _business_files(list_sandbox_files_changed_by_run(run_id))
        recent_changes = _build_recent_changes(existing_index, run_id, changed_files, artifact_changes or [])
        _validate_index_payload(workspace_id, conversation_id, tree, artifact_map, recent_changes)
        summary, feature_map = await _summarize_workspace_index(
            workspace_id,
            tree,
            artifact_map,
            recent_changes,
            existing_index,
        )
        _validate_index_payload(workspace_id, conversation_id, tree, artifact_map, recent_changes)
        return upsert_workspace_index(
            workspace_id=workspace_id,
            summary=summary,
            tree=tree,
            feature_map=feature_map,
            artifact_map=artifact_map,
            deployment_map=deployment_map,
            recent_changes=recent_changes,
            last_run_id=run_id,
            status="fresh",
        )
    except Exception as exc:
        mark_workspace_index_stale(workspace_id, str(exc), last_run_id=run_id)
        print(f"❌ [WorkspaceIndex] update failed run={run_id} error={exc}", flush=True)
        return None


def _target_identity_count(workspace_id: str, target_files: List[Dict[str, Any]], target_artifacts: List[str]) -> int:
    identities = {f"file:{item['path']}" for item in target_files if isinstance(item, dict) and item.get("path")}
    target_paths = {item["path"] for item in target_files if isinstance(item, dict) and item.get("path")}
    for artifact_id in target_artifacts:
        bound = get_sandbox_file_by_artifact(workspace_id, artifact_id)
        if bound and bound.get("path") in target_paths:
            continue
        identities.add(f"artifact:{artifact_id}")
    return len(identities)


def _target_feature_matches(
    target_files: List[Dict[str, Any]],
    target_artifacts: List[str],
    candidate_targets: List[Dict[str, Any]],
    index: Optional[Dict[str, Any]],
) -> List[str]:
    feature_map = (index or {}).get("featureMap") or {}
    if not isinstance(feature_map, dict):
        return []
    target_paths = {item["path"] for item in target_files if isinstance(item, dict) and item.get("path")}
    target_artifact_ids = set(target_artifacts)
    explicit_feature_names = {
        str(item.get("id") or item.get("title") or "").strip()
        for item in candidate_targets
        if isinstance(item, dict) and item.get("kind") == "feature"
    }
    matches: List[str] = []
    for name, feature in feature_map.items():
        if not isinstance(feature, dict):
            continue
        feature_files = set(_feature_files(feature))
        feature_artifacts = set(_feature_artifacts(feature))
        if name in explicit_feature_names:
            matches.append(name)
            continue
        if target_paths and target_paths.issubset(feature_files):
            matches.append(name)
            continue
        if target_artifact_ids and target_artifact_ids.issubset(feature_artifacts):
            matches.append(name)
    return _unique_list(matches)


def _feature_text_matches(user_content: str, feature_name: str, feature: Dict[str, Any]) -> bool:
    normalized = (user_content or "").lower()
    name = str(feature_name or "").strip()
    description = str(feature.get("description") or "").strip()
    if name and (name in user_content or name.lower() in normalized):
        return True
    if description and len(description) >= 4 and (description in user_content or description.lower() in normalized):
        return True
    return False


def _build_feature_action_raw(
    feature_name: str,
    feature: Dict[str, Any],
    existing_files: Dict[str, Dict[str, Any]],
    artifact_ids: set,
    reason: str,
) -> Optional[Dict[str, Any]]:
    feature_files = [path for path in _feature_files(feature) if path in existing_files]
    feature_artifacts = [artifact_id for artifact_id in _feature_artifacts(feature) if artifact_id in artifact_ids]
    if not feature_files and not feature_artifacts:
        return None
    core_files = _feature_core_files(feature, existing_files)
    if not core_files:
        core_files = feature_files
    allowed_related = [path for path in feature_files if path not in set(core_files)]
    return {
        "action": "modify_existing",
        "confidence": 0.92,
        "targetFiles": core_files,
        "allowedRelatedFiles": allowed_related,
        "targetArtifacts": feature_artifacts,
        "candidateTargets": [
            {"kind": "feature", "id": feature_name, "title": feature_name, "reason": reason}
        ],
        "reason": reason,
    }


def _deterministic_workspace_action(
    user_content: str,
    files: List[Dict[str, Any]],
    artifacts: List[Dict[str, Any]],
    index: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    if not _looks_like_modify_existing(user_content):
        return None
    existing_files = {item["path"]: item for item in files}
    artifact_ids = {item["id"] for item in artifacts}
    feature_map = (index or {}).get("featureMap") or {}
    if isinstance(feature_map, dict) and feature_map:
        matched = [
            (name, feature)
            for name, feature in feature_map.items()
            if isinstance(feature, dict) and _feature_text_matches(user_content, name, feature)
        ]
        if len(matched) == 1:
            name, feature = matched[0]
            return _build_feature_action_raw(
                name,
                feature,
                existing_files,
                artifact_ids,
                "用户消息唯一匹配 workspace featureMap",
            )
        if len(feature_map) == 1:
            name, feature = next(iter(feature_map.items()))
            if isinstance(feature, dict):
                return _build_feature_action_raw(
                    name,
                    feature,
                    existing_files,
                    artifact_ids,
                    "workspace 只有一个 feature 且用户表达修改意图",
                )
    if len(existing_files) == 1:
        only_file = next(iter(existing_files.values()))
        artifact_id = only_file.get("artifactId")
        return {
            "action": "modify_existing",
            "confidence": 0.9,
            "targetFiles": [only_file["path"]],
            "allowedRelatedFiles": [],
            "targetArtifacts": [artifact_id] if artifact_id else [],
            "candidateTargets": [
                {"kind": "file", "path": only_file["path"], "title": only_file["path"], "reason": "workspace 只有一个文件且用户表达修改意图"}
            ],
            "reason": "single file workspace modify intent",
        }
    return None


def _normalize_action(
    raw: Dict[str, Any],
    workspace_id: str,
    conversation_id: str,
    files: List[Dict[str, Any]],
    artifacts: List[Dict[str, Any]],
    index: Optional[Dict[str, Any]],
    user_content: str = "",
) -> Dict[str, Any]:
    existing_files = {item["path"]: item for item in files}
    artifact_ids = {item["id"] for item in artifacts}
    action = str(raw.get("action") or "create_new").strip()
    if action not in {"create_new", "modify_existing", "answer_only", "clarify"}:
        action = "clarify"
    original_action = action
    try:
        confidence = float(raw.get("confidence") or 0)
    except (TypeError, ValueError):
        confidence = 0.0

    target_files: List[Dict[str, Any]] = []
    raw_target_files = raw.get("targetFiles") or []
    for item in raw_target_files:
        path = item.get("path") if isinstance(item, dict) else item
        safe_path = _safe_relative_path(str(path or ""))
        file_meta = existing_files.get(safe_path or "")
        if file_meta:
            target_files.append({
                "path": file_meta["path"],
                "baseVersion": int(file_meta.get("currentVersion") or 0),
                "contentHash": file_meta.get("contentHash") or "",
                "artifactId": file_meta.get("artifactId"),
            })

    target_artifacts: List[str] = []
    for artifact_id in raw.get("targetArtifacts") or []:
        artifact_id = str(artifact_id or "").strip()
        if artifact_id in artifact_ids:
            target_artifacts.append(artifact_id)
            bound = get_sandbox_file_by_artifact(workspace_id, artifact_id)
            if bound and not any(item["path"] == bound["path"] for item in target_files):
                target_files.append({
                    "path": bound["path"],
                    "baseVersion": int(bound.get("currentVersion") or 0),
                    "contentHash": bound.get("contentHash") or "",
                    "artifactId": artifact_id,
                })

    feature_map = (index or {}).get("featureMap") or {}
    candidate_targets = []
    for candidate in raw.get("candidateTargets") or []:
        if not isinstance(candidate, dict):
            continue
        kind = str(candidate.get("kind") or "").strip()
        if kind not in {"file", "artifact", "feature"}:
            continue
        path = _safe_relative_path(str(candidate.get("path") or "")) if candidate.get("path") else None
        artifact_id = str(candidate.get("id") or "").strip() or None
        if path and path not in existing_files:
            path = None
        if kind == "artifact" and artifact_id not in artifact_ids:
            artifact_id = None
        if kind == "feature":
            feature_id = str(candidate.get("id") or candidate.get("title") or "").strip()
            if feature_id not in feature_map:
                feature_id = None
            artifact_id = feature_id
        candidate_targets.append({
            "kind": kind,
            "id": artifact_id,
            "path": path,
            "title": str(candidate.get("title") or "")[:120],
            "reason": str(candidate.get("reason") or "")[:500],
        })

    if action in {"modify_existing", "clarify"} and not target_files:
        for candidate in candidate_targets:
            if candidate.get("kind") != "file" or not candidate.get("path"):
                continue
            file_meta = existing_files.get(candidate["path"])
            if file_meta and not any(item["path"] == file_meta["path"] for item in target_files):
                target_files.append({
                    "path": file_meta["path"],
                    "baseVersion": int(file_meta.get("currentVersion") or 0),
                    "contentHash": file_meta.get("contentHash") or "",
                    "artifactId": file_meta.get("artifactId"),
                })

    candidate_file_paths = {
        item["path"]
        for item in candidate_targets
        if item.get("kind") == "file" and item.get("path")
    }
    candidate_target_paths = {
        item["path"]
        for item in candidate_targets
        if item.get("path")
    }
    target_file_artifact_ids = {
        item["artifactId"]
        for item in target_files
        if item.get("artifactId")
    }
    target_artifacts_are_file_backed = (
        not target_artifacts
        or set(target_artifacts).issubset(target_file_artifact_ids)
    )
    if (
        action == "clarify"
        and _looks_like_modify_existing(user_content)
        and target_files
        and target_artifacts_are_file_backed
        and len(target_files) <= 12
        and confidence >= 0.55
    ):
        action = "modify_existing"

    related_candidates = set()
    for feature in feature_map.values() if isinstance(feature_map, dict) else []:
        if not isinstance(feature, dict):
            continue
        feature_files = set(_feature_files(feature))
        feature_artifacts = set(_feature_artifacts(feature))
        if feature_files.intersection({item["path"] for item in target_files}) or feature_artifacts.intersection(set(target_artifacts)):
            related_candidates.update(feature_files)
    for item in target_files:
        parent = str(Path(item["path"]).parent)
        if parent == ".":
            parent = ""
        for path in existing_files:
            if str(Path(path).parent) == parent:
                related_candidates.add(path)
    for path in raw.get("allowedRelatedFiles") or []:
        safe_path = _safe_relative_path(str(path or ""))
        if safe_path in existing_files:
            related_candidates.add(safe_path)
    allowed_related = sorted(path for path in related_candidates if path in existing_files and path not in {item["path"] for item in target_files})

    if action == "modify_existing":
        target_count = _target_identity_count(workspace_id, target_files, target_artifacts)
        feature_matches = _target_feature_matches(target_files, target_artifacts, candidate_targets, index)
        target_paths = {item["path"] for item in target_files if item.get("path")}
        confident_explicit_multi_file_target = (
            target_count > 1
            and (
                confidence >= 0.85
                or (
                    original_action == "clarify"
                    and confidence >= 0.55
                    and _looks_like_modify_existing(user_content)
                )
            )
            and bool(target_paths)
            and (
                target_paths.issubset(candidate_file_paths)
                or target_paths.issubset(candidate_target_paths)
                or original_action == "clarify"
            )
            and target_artifacts_are_file_backed
        )
        if (
            confidence < WORKSPACE_ACTION_CONFIDENCE_THRESHOLD
            or target_count == 0
            or (
                target_count > 1
                and len(feature_matches) != 1
                and not confident_explicit_multi_file_target
            )
        ):
            action = "clarify"
    return {
        "action": action,
        "confidence": confidence,
        "targetFiles": target_files,
        "allowedRelatedFiles": allowed_related,
        "targetArtifacts": target_artifacts,
        "candidateTargets": candidate_targets,
        "clarificationQuestion": str(raw.get("clarificationQuestion") or "请明确要修改哪个功能或文件？"),
        "reason": str(raw.get("reason") or ""),
    }


async def resolve_workspace_action(
    conversation_id: str,
    workspace_id: str,
    user_content: str,
    explicit_artifact_ref: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    files = _business_files(list_sandbox_files_for_workspace(workspace_id))
    artifacts = list_artifacts_for_workspace(workspace_id) or list_artifacts(conversation_id)
    index = get_workspace_index(workspace_id)
    if explicit_artifact_ref and explicit_artifact_ref.get("artifactId"):
        artifact_id = explicit_artifact_ref["artifactId"]
        artifact = get_artifact(artifact_id)
        artifact_workspace_id = str((artifact or {}).get("workspaceId") or "").strip()
        if not artifact or (
            artifact_workspace_id
            and artifact_workspace_id != workspace_id
        ) or (
            not artifact_workspace_id
            and artifact.get("conversationId") != conversation_id
        ):
            return {
                "action": "clarify",
                "confidence": 0,
                "targetFiles": [],
                "allowedRelatedFiles": [],
                "targetArtifacts": [],
                "candidateTargets": [],
                "clarificationQuestion": "引用的产物不存在或不属于当前 Workspace。",
                "reason": "invalid artifactRef",
            }
        bound = get_sandbox_file_by_artifact(workspace_id, artifact_id)
        raw = {
            "action": "modify_existing",
            "confidence": 1.0,
            "targetFiles": [bound["path"]] if bound else [],
            "targetArtifacts": [artifact_id],
            "candidateTargets": [{"kind": "artifact", "id": artifact_id, "title": artifact.get("title"), "reason": "显式 artifactRef"}],
            "reason": "explicit artifactRef",
        }
        return _normalize_action(raw, workspace_id, conversation_id, files, artifacts, index, user_content=user_content)

    if not files and not artifacts:
        return {
            "action": "create_new",
            "confidence": 0.9,
            "targetFiles": [],
            "allowedRelatedFiles": [],
            "targetArtifacts": [],
            "candidateTargets": [],
            "clarificationQuestion": "",
            "reason": "empty workspace",
        }

    deterministic_raw = _deterministic_workspace_action(user_content, files, artifacts, index)
    if deterministic_raw:
        return _normalize_action(deterministic_raw, workspace_id, conversation_id, files, artifacts, index, user_content=user_content)

    prompt = json.dumps(
        {
            "userMessage": user_content,
            "workspaceIndex": index or {},
            "files": [
                {
                    "path": item.get("path"),
                    "version": item.get("currentVersion"),
                    "hash": item.get("contentHash"),
                    "artifactId": item.get("artifactId"),
                }
                for item in files[:120]
            ],
            "artifacts": [
                {
                    "id": item.get("id"),
                    "title": item.get("title"),
                    "type": item.get("type"),
                    "latestVersion": item.get("latestVersion"),
                }
                for item in artifacts[:80]
            ],
        },
        ensure_ascii=False,
    )
    try:
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=settings.MODEL_EP,
            messages=[
                {"role": "system", "content": WORKSPACE_ACTION_RESOLVER_PROMPT},
                {"role": "user", "content": prompt},
            ],
            stream=False,
        )
        raw = _parse_json_object(response.choices[0].message.content or "")
    except Exception as exc:
        print(f"❌ [WorkspaceActionResolver] failed: {exc}", flush=True)
        return {
            "action": "create_new",
            "confidence": 0.5,
            "targetFiles": [],
            "allowedRelatedFiles": [],
            "targetArtifacts": [],
            "candidateTargets": [],
            "clarificationQuestion": "",
            "reason": f"resolver failed: {exc}",
        }
    return _normalize_action(raw, workspace_id, conversation_id, files, artifacts, index, user_content=user_content)


def workspace_index_brief(workspace_id: Optional[str]) -> str:
    if not workspace_id:
        return ""
    index = get_workspace_index(workspace_id)
    if not index:
        return ""
    parts = []
    header = (
        f"[Workspace Index]\n"
        f"workspaceId={workspace_id} status={index.get('status')} version={index.get('version')} "
        f"updatedAt={index.get('updatedAt') or '-'}"
    )
    if index.get("summary"):
        header += f"\nsummary={index['summary']}"
    parts.append(header)

    tree = index.get("tree") or {}
    file_lines: List[str] = []

    def collect_files(node: Dict[str, Any]) -> None:
        if node.get("type") == "file" and node.get("path"):
            details = [
                f"v{node.get('version') or '-'}",
                f"mime={node.get('mimeType') or '-'}",
                f"size={node.get('size') if node.get('size') is not None else '-'}",
                f"sha256={node.get('sha256') or node.get('hash') or '-'}",
                f"isText={node.get('isText')}",
                f"artifactId={node.get('artifactId') or '-'}",
            ]
            preview = str(node.get("contentPreview") or "").strip()
            if preview:
                preview = re.sub(r"\s+", " ", preview)[:300]
                details.append(f"preview={preview}")
            file_lines.append(
                f"- {node.get('path')} " + " ".join(details)
            )
        for child in node.get("children") or []:
            if isinstance(child, dict):
                collect_files(child)

    if isinstance(tree, dict):
        collect_files(tree)
    if file_lines:
        parts.append("[文件树摘要]\n" + "\n".join(file_lines[:80]))

    feature_map = index.get("featureMap") or {}
    if feature_map:
        lines = []
        for name, item in list(feature_map.items())[:20]:
            if not isinstance(item, dict):
                continue
            file_groups = []
            for key in FEATURE_FILE_KEYS:
                values = item.get(key) or []
                if values:
                    file_groups.append(f"{key}={', '.join(values)}")
            artifacts = ", ".join(item.get("artifacts") or []) or "无"
            lines.append(f"- {name}: {item.get('description', '')} | {' | '.join(file_groups) or 'files=无'} | artifacts={artifacts}")
        if lines:
            parts.append("[功能地图]\n" + "\n".join(lines))

    artifact_map = index.get("artifactMap") or {}
    if artifact_map:
        lines = []
        for artifact_id, item in list(artifact_map.items())[:40]:
            if not isinstance(item, dict):
                continue
            lines.append(
                f"- {artifact_id}: title={item.get('title') or '-'} type={item.get('type') or '-'} "
                f"latestVersion={item.get('latestVersion') or '-'} filePath={item.get('filePath') or '-'} "
                f"fileVersion={item.get('fileVersion') or '-'} fileHash={item.get('fileHash') or '-'}"
            )
        if lines:
            parts.append("[Artifact 映射]\n" + "\n".join(lines))

    deployment_map = index.get("deploymentMap") or {}
    if deployment_map:
        latest = deployment_map.get("latest") if isinstance(deployment_map.get("latest"), dict) else {}
        recent = deployment_map.get("recent") if isinstance(deployment_map.get("recent"), list) else []
        lines = []
        if latest:
            lines.append(
                f"- latest deploymentId={latest.get('deploymentId') or '-'} status={latest.get('status') or '-'} "
                f"type={latest.get('deployType') or '-'} projectType={latest.get('projectType') or '-'} "
                f"urls={json.dumps(latest.get('serviceUrls') or {}, ensure_ascii=False)}"
            )
        for item in recent[:3]:
            if not isinstance(item, dict):
                continue
            lines.append(
                f"- recent deploymentId={item.get('deploymentId') or '-'} status={item.get('status') or '-'} "
                f"projectType={item.get('projectType') or '-'} urls={json.dumps(item.get('serviceUrls') or {}, ensure_ascii=False)}"
            )
        if lines:
            parts.append("[部署信息]\n" + "\n".join(lines))

    recent_changes = index.get("recentChanges") or []
    if recent_changes:
        lines = []
        for change in recent_changes[:5]:
            if not isinstance(change, dict):
                continue
            files = ", ".join(
                str(item.get("path") or "")
                for item in change.get("files") or []
                if isinstance(item, dict) and item.get("path")
            ) or "无"
            artifacts = ", ".join(
                str((item.get("artifact") or {}).get("id") or item.get("artifactId") or "")
                for item in change.get("artifactChanges") or []
                if isinstance(item, dict)
            ) or "无"
            lines.append(f"- run={change.get('runId') or '-'} files={files} artifacts={artifacts}")
        if lines:
            parts.append("[最近变更]\n" + "\n".join(lines))
    return "\n\n".join(parts)
