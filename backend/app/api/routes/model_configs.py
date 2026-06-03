from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Header

from app.api.deps import current_user_or_default
from app.api.responses import fail, ok
from app.database import (
    create_model_config,
    create_model_credential,
    delete_model_config,
    delete_model_credential,
    list_model_configs,
    list_model_credentials,
    update_model_config,
    update_model_credential,
)
from app.model_providers.registry import list_model_providers
from app.model_providers.service import test_model_config_connectivity

router = APIRouter(prefix="/api/v1")


@router.get("/model-providers")
async def api_list_model_providers():
    return ok(list_model_providers())


@router.get("/model-credentials")
async def api_list_model_credentials(authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    return ok(list_model_credentials(current_user["id"]))


@router.post("/model-credentials")
async def api_create_model_credential(payload: Dict[str, Any] = Body(...), authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    if not str(payload.get("secret") or payload.get("apiKey") or payload.get("api_key") or "").strip():
        return fail(40000, "secret/apiKey 不能为空")
    return ok(create_model_credential(current_user["id"], payload), message="模型凭证已创建")


@router.put("/model-credentials/{credential_id}")
async def api_update_model_credential(credential_id: str, payload: Dict[str, Any] = Body(...), authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    credential = update_model_credential(credential_id, current_user["id"], payload)
    if not credential:
        return fail(40001, "模型凭证不存在")
    return ok(credential, message="模型凭证已更新")


@router.delete("/model-credentials/{credential_id}")
async def api_delete_model_credential(credential_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    if not delete_model_credential(credential_id, current_user["id"]):
        return fail(40001, "模型凭证不存在")
    return ok(True, message="模型凭证已删除")


@router.get("/model-configs")
async def api_list_model_configs(authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    return ok(list_model_configs(current_user["id"]))


@router.post("/model-configs")
async def api_create_model_config(payload: Dict[str, Any] = Body(...), authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    if not str(payload.get("modelName") or payload.get("model_name") or "").strip():
        return fail(40000, "model_name 不能为空")
    return ok(create_model_config(current_user["id"], payload), message="模型配置已创建")


@router.put("/model-configs/{config_id}")
async def api_update_model_config(config_id: str, payload: Dict[str, Any] = Body(...), authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    config = update_model_config(config_id, current_user["id"], payload)
    if not config:
        return fail(40001, "模型配置不存在")
    return ok(config, message="模型配置已更新")


@router.delete("/model-configs/{config_id}")
async def api_delete_model_config(config_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    if not delete_model_config(config_id, current_user["id"]):
        return fail(40001, "模型配置不存在")
    return ok(True, message="模型配置已删除")


@router.post("/model-configs/{config_id}/test")
async def api_test_model_config(config_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    result = test_model_config_connectivity(config_id, current_user["id"])
    return ok(result, message="模型配置测试完成")

