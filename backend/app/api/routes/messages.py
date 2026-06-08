import asyncio
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Body, File, Header, Query, Request, Response, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse

from app.api.deps import current_user_or_default, extract_bearer_token
from app.api.responses import ok, fail
from app.database import *
from app.services.agent_service import *
from app.services.artifact_service import *
from app.services.attachment_context_service import (
    append_attachment_context_to_input,
    attachment_read_only_intent,
    build_attachment_full_context,
    build_attachment_context,
    has_vision_attachments,
    maybe_force_attachment_chat,
    resolve_message_attachments,
    save_upload_attachment,
    uploaded_attachment_path,
)
from app.services.context_service import *
from app.services.memory_service import *
from app.services.message_service import *
from app.services.run_service import *
from app.services.intent_service import classify_for_conversation
from app.services.web_search_service import prepare_web_search_for_chat
from app.services.ws_service import *
from app.services.deployment_service import (
    create_workspace_deployment_request,
    request_base_url_from_request,
    run_workspace_deployment,
)
from app.runtimes.router import runtime_router

router = APIRouter(prefix="/api/v1")


@router.post("/conversations/{conversation_id}/attachments")
async def api_upload_conversation_attachment(
    conversation_id: str,
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在")
    try:
        attachment = await save_upload_attachment(current_user["id"], conversation_id, file)
    except ValueError as exc:
        return fail(40002, str(exc))
    return ok({"attachment": attachment}, message="附件上传成功")


@router.post("/conversations/{conversation_id}/attachments/batch")
async def api_upload_conversation_attachments_batch(
    conversation_id: str,
    files: List[UploadFile] = File(...),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在")
    results: List[Dict[str, Any]] = []
    for file in files:
        try:
            attachment = await save_upload_attachment(current_user["id"], conversation_id, file)
            results.append({"ok": True, "attachment": attachment})
        except Exception as exc:
            results.append({
                "ok": False,
                "name": file.filename or "attachment",
                "error": str(exc),
            })
    return ok({"results": results}, message="附件批量上传完成")


@router.get("/conversations/{conversation_id}/attachments/{attachment_id}")
async def api_download_conversation_attachment(
    conversation_id: str,
    attachment_id: str,
    accessToken: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    signed_access = verify_attachment_access_token(conversation_id, attachment_id, accessToken)
    if signed_access:
        conversation = get_conversation(conversation_id)
        current_user = {"id": conversation["ownerUserId"]} if conversation else None
    else:
        current_user = current_user_or_default(authorization)
        conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在")
    owner_user_id = str((current_user or {}).get("id") or conversation.get("ownerUserId") or "")
    path = uploaded_attachment_path(owner_user_id, conversation_id, attachment_id)
    if not path:
        return fail(40001, "附件不存在或已被清理")
    attachment = get_conversation_attachment(conversation_id, attachment_id)
    filename = (attachment or {}).get("name") or path.name
    return FileResponse(
        path,
        filename=filename,
        media_type=(attachment or {}).get("mimeType") or "application/octet-stream",
    )


@router.post("/conversations/{conversation_id}/messages")
async def api_send_message(
    conversation_id: str,
    background_tasks: BackgroundTasks,
    request: Request,
    payload: Dict[str, Any] = Body(...),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在")
    print("MESSAGE PAYLOAD:", payload)
    original_content = str(payload.get("content", "")).strip()
    content = original_content
    resolved_attachments = resolve_message_attachments(payload, conversation_id)
    attachments = resolved_attachments["public"]
    internal_attachments = resolved_attachments["internal"]
    attachment_summary = attachment_summary_content(attachments) if attachments else ""
    model_content = content or attachment_summary
    print("MESSAGE CONTENT:", content)
    target_agent_id = str(payload.get("targetAgentId") or payload.get("targetAgentID") or "").strip() or None
    quoted_message_id = get_quoted_message_id(payload)
    if is_system_message_payload(payload):
        return fail(40002, "客户端不允许创建 system/status 消息")
    if not content and not attachments:
        return fail(40000, "消息内容不能为空")

    quoted_message = None
    message_metadata: Dict[str, Any] = {}
    if quoted_message_id:
        quoted_message = get_message_in_conversation(conversation_id, quoted_message_id)
        if not quoted_message:
            return fail(40003, "引用消息不存在或不属于当前会话")
        message_metadata = build_quote_metadata(quoted_message)
    artifact_ref, artifact_ref_error = await resolve_artifact_context_for_message(
        payload,
        conversation_id,
        current_user["id"],
        model_content,
    )
    if artifact_ref_error:
        return fail(40003, artifact_ref_error)
    if artifact_ref:
        message_metadata["artifactRef"] = artifact_ref
    attachment_context = build_attachment_context(attachments) if attachments else {"items": [], "context": ""}
    if attachments:
        message_metadata["attachments"] = attachments
        message_metadata["attachmentContext"] = attachment_context
    model_user_input = build_user_input_with_references(model_content, quoted_message, artifact_ref)
    if original_content and attachments and attachment_read_only_intent(original_content):
        full_context = build_attachment_full_context(internal_attachments)
        if full_context:
            model_user_input = f"{model_user_input}\n\n[本轮临时加载的附件正文]\n{full_context}".strip()
    model_user_input = append_attachment_context_to_input(model_user_input, attachment_context)
    execution_payload = payload_with_resolved_artifact_ref(payload, artifact_ref)
    if attachments:
        execution_payload = {
            **execution_payload,
            "attachments": internal_attachments,
            "attachmentPlaceholders": attachments,
            "attachmentContext": attachment_context,
        }
    pending_clarification = latest_pending_workspace_clarification(conversation_id) if artifact_ref else None
    if pending_clarification and looks_like_target_clarification(content, artifact_ref):
        execution_payload = {**execution_payload, "pendingWorkspaceClarification": True}
    execution_user_input = build_execution_input_for_workspace_action(
        model_content,
        model_user_input,
        pending_clarification,
        artifact_ref,
    )
    target_agent = choose_target_agent(conversation, target_agent_id)
    if target_agent_id and not target_agent:
        return fail(40002, "指定 Agent 不存在、已禁用或不属于当前会话")
    target_agent = target_agent or infer_mentioned_agent(conversation, content)
    mentioned_agent = infer_any_mentioned_agent(conversation, content)
    if mentioned_agent and not agent_is_callable(mentioned_agent):
        return fail(40002, "指定 Agent 已禁用，无法继续对话")
    if conversation["mode"] in {"agent", "single"} and not choose_agent_for_conversation(conversation):
        return fail(40002, "当前 Agent 已禁用，无法继续对话")
    if conversation["mode"] == "group" and not target_agent and not get_enabled_orchestrator(conversation):
        return fail(40002, "Orchestrator 已禁用，无法自动调度；请 @ 一个可用 Agent")

    user_message = create_message(
        conversation_id=conversation_id,
        sender_id="user",
        sender_name="用户",
        role="user",
        msg_type="text",
        content=content,
        metadata=message_metadata,
    )
    if attachments:
        user_message["attachments"] = create_message_attachments(
            conversation_id,
            user_message["id"],
            attachments,
        )
    update_conversation_activity(conversation_id, content or attachment_summary)
    chat_context: Dict[str, Any] = {"excludeMessageId": user_message["id"]}
    if has_vision_attachments(internal_attachments):
        chat_context["visionAttachments"] = internal_attachments

    memory_extraction_scheduled = False

    def schedule_memory_once(messages: Optional[List[Dict[str, Any]]] = None) -> None:
        nonlocal memory_extraction_scheduled
        if memory_extraction_scheduled:
            return
        memory_extraction_scheduled = True
        schedule_memory_extraction(conversation, user_message, messages or [])

    agent_messages: List[Dict[str, Any]] = []
    artifacts: List[Dict[str, Any]] = []
    raw_execution_mode = str(payload.get("executionMode") or payload.get("runMode") or "").strip().lower()
    if attachments and not original_content and raw_execution_mode not in {"deployment", "deploy"}:
        execution_decision = {
            "executionMode": "chat",
            "intent": "attachment_only",
            "confidence": 1.0,
            "reason": "用户只上传了附件，默认基于附件摘要走普通聊天",
        }
    else:
        execution_decision = None
    if execution_decision is None:
        classification_content = append_attachment_context_to_input(content, attachment_context)
        try:
            execution_decision = await classify_for_conversation(
                conversation=conversation,
                selected_agent=target_agent,
                content=classification_content,
                payload=execution_payload,
            )
        except Exception as exc:
            error_message = create_message(
                conversation_id=conversation_id,
                sender_id="system",
                sender_name="系统",
                role="system",
                msg_type="status",
                content=f"意图识别失败：{format_model_error(exc)}",
                metadata={"event": "execution.mode.failed"},
            )
            update_conversation_activity(conversation_id, error_message["content"])
            return ok(
                {
                    "userMessage": user_message,
                    "agentMessages": [error_message],
                    "artifacts": [],
                    "contextUsage": build_context_usage(conversation),
                    "executionMode": "error",
                    "reason": "意图识别失败",
                },
                message="意图识别失败",
            )
    execution_decision = maybe_force_attachment_chat(content, attachments, execution_decision)
    if execution_decision["executionMode"] == "deployment":
        deploy_agent_id = target_agent.get("id") if target_agent else target_agent_id
        deploy_agent_selection = resolve_deploy_agent_for_conversation(conversation, deploy_agent_id)
        if not deploy_agent_selection.get("ok"):
            status_content = deploy_agent_selection.get("error") or "当前 Agent 未启用 deploy.run，不能发起部署。"
            status_message = create_message(
                conversation_id=conversation_id,
                sender_id="system",
                sender_name="系统",
                role="system",
                msg_type="status",
                content=status_content,
                metadata={
                    "event": "agent.tool.rejected",
                    "requiredTool": "deploy.run",
                    "executionMode": "deployment",
                    "reason": deploy_agent_selection.get("reason"),
                },
            )
            agent_messages.append(status_message)
            update_conversation_activity(conversation_id, status_content)
            schedule_memory_once(agent_messages)
            return ok({
                "userMessage": user_message,
                "agentMessages": agent_messages,
                "artifacts": artifacts,
                "contextUsage": build_context_usage(conversation),
                "executionMode": "deployment",
                "deployment": None,
            }, message="Agent 未授权部署工具")
        workspace_id = str(conversation.get("workspaceId") or "").strip()
        workspace = get_workspace(workspace_id, owner_user_id=current_user["id"]) if workspace_id else None
        if not workspace:
            status_content = "当前会话没有绑定 Workspace，无法部署。请先在带工作区的 single/group 会话中发起部署。"
            status_message = create_message(
                conversation_id=conversation_id,
                sender_id="system",
                sender_name="系统",
                role="system",
                msg_type="status",
                content=status_content,
                metadata={
                    "source": "chatDeployment",
                    "status": "requires_config",
                    "reason": "missing_workspace",
                },
            )
            agent_messages.append(status_message)
            update_conversation_activity(conversation_id, status_content)
            schedule_memory_once(agent_messages)
            return ok({
                "userMessage": user_message,
                "agentMessages": agent_messages,
                "artifacts": artifacts,
                "contextUsage": build_context_usage(conversation),
                "executionMode": "deployment",
                "deployment": None,
            }, message="需要绑定 Workspace 后才能部署")
        deployment = create_workspace_deployment_request(
            workspace_id=workspace["id"],
            owner_user_id=current_user["id"],
            conversation_id=conversation_id,
            config={
                **(payload.get("deploymentConfig") if isinstance(payload.get("deploymentConfig"), dict) else {}),
                **deployment_agent_metadata(deploy_agent_selection),
            },
            public_base_url=str(payload.get("publicBaseUrl") or request_base_url_from_request(request)).rstrip("/"),
            chat_deployment=True,
        )
        initial_message = deployment.get("initialMessage")
        if initial_message:
            agent_messages.append(initial_message)

        async def run_deployment_background() -> None:
            loop = asyncio.get_running_loop()
            deployment_message_futures: List[asyncio.Future] = []

            def deployment_message_callback(message: Dict[str, Any]) -> None:
                future = asyncio.run_coroutine_threadsafe(
                    send_message_completed(current_user, conversation_id, None, message),
                    loop,
                )
                deployment_message_futures.append(asyncio.wrap_future(future, loop=loop))

            await asyncio.to_thread(run_workspace_deployment, deployment["id"], deployment_message_callback)
            if deployment_message_futures:
                await asyncio.gather(*deployment_message_futures, return_exceptions=True)
            final_deployment = get_workspace_deployment(deployment["id"], owner_user_id=current_user["id"])
            await emit_conversation_event(
                current_user,
                conversation_id,
                "conversation.all_tasks.completed",
                None,
                {
                    "conversationId": conversation_id,
                    "summary": (
                        "部署已完成"
                        if final_deployment and final_deployment.get("status") == "deployed"
                        else "部署流程已结束"
                    ),
                    "totalMessages": len(deployment_message_futures) + (1 if initial_message else 0),
                    "totalArtifacts": 0,
                    "contextUsage": build_context_usage(conversation),
                    "executionMode": "deployment",
                    "deployment": final_deployment,
                },
            )

        background_tasks.add_task(run_deployment_background)
        schedule_memory_once(agent_messages)
        return ok({
            "userMessage": user_message,
            "agentMessages": agent_messages,
            "artifacts": artifacts,
            "contextUsage": build_context_usage(conversation),
            "executionMode": "deployment",
            "deployment": {key: value for key, value in deployment.items() if key != "initialMessage"},
        }, message="部署任务已创建")
    if execution_decision["executionMode"] == "sandbox" and artifact_ref:
        execution_decision = {**execution_decision, "suggestedRunPrompt": execution_user_input}
    if execution_decision["executionMode"] == "sandbox":
        async def emit(event_type: str, data: Dict[str, Any]) -> None:
            await emit_run_event(current_user, conversation_id, event_type, data)

        try:
            run_agent = target_agent or choose_agent_for_conversation(conversation)
            run = await runtime_router.create_run(
                run_agent,
                current_user=current_user,
                conversation_id=conversation_id,
                prompt=execution_decision.get("suggestedRunPrompt") or model_user_input,
                payload=execution_payload,
                emit=emit,
            )
        except WorkspaceActionDecision as exc:
            action_context = exc.action_context
            if action_context.get("action") == "answer_only":
                agent = target_agent or choose_agent_for_conversation(conversation)
                try:
                    answer_content = await runtime_router.execute_chat(
                        agent,
                        conversation,
                        model_user_input,
                        chat_context,
                    )
                except Exception as answer_exc:
                    answer_content = fallback_reply(agent, content, answer_exc)
                answer_message = create_message(
                    conversation_id=conversation_id,
                    sender_id=agent["id"],
                    sender_name=agent["name"],
                    role="agent",
                    msg_type="text",
                    content=answer_content,
                    metadata={"workspaceActionContext": action_context},
                )
                agent_messages.append(answer_message)
                update_conversation_activity(conversation_id, answer_content)
                schedule_memory_once(agent_messages)
                return ok({
                    "userMessage": user_message,
                    "agentMessages": agent_messages,
                    "artifacts": artifacts,
                    "contextUsage": build_context_usage(conversation),
                    "executionMode": "chat",
                    "intent": execution_decision["intent"],
                    "reason": action_context.get("reason") or execution_decision["reason"],
                    "workspaceActionContext": action_context,
                }, message="消息发送成功")
            decision_content = (
                action_context.get("clarificationQuestion")
                or "请补充要修改的目标。"
            )
            decision_message = create_message(
                conversation_id=conversation_id,
                sender_id="system",
                sender_name="系统",
                role="system",
                msg_type="status",
                content=decision_content,
                metadata={
                    "event": "workspace.action.decision",
                    "workspaceActionContext": action_context,
                    "executionMode": "chat" if action_context.get("action") == "answer_only" else "clarify",
                },
            )
            agent_messages.append(decision_message)
            update_conversation_activity(conversation_id, decision_content)
            schedule_memory_once(agent_messages)
            return ok({
                "userMessage": user_message,
                "agentMessages": agent_messages,
                "artifacts": artifacts,
                "contextUsage": build_context_usage(conversation),
                "executionMode": "chat" if action_context.get("action") == "answer_only" else "clarify",
                "intent": execution_decision["intent"],
                "reason": action_context.get("reason") or execution_decision["reason"],
                "workspaceActionContext": action_context,
            }, message="需要确认修改目标" if action_context.get("action") == "clarify" else "未创建沙箱任务")
        except ValueError as exc:
            error_content = str(exc)
            error_message = create_message(
                conversation_id=conversation_id,
                sender_id="system",
                sender_name="系统",
                role="system",
                msg_type="status",
                content=error_content,
                metadata={
                    "event": "sandbox.run.rejected",
                    "executionMode": execution_decision["executionMode"],
                    "intent": execution_decision["intent"],
                    "reason": execution_decision["reason"],
                    "error": error_content,
                },
            )
            agent_messages.append(error_message)
            update_conversation_activity(conversation_id, error_content)
            return ok({
                "userMessage": user_message,
                "agentMessages": agent_messages,
                "artifacts": artifacts,
                "contextUsage": build_context_usage(conversation),
                "executionMode": "error",
                "intent": execution_decision["intent"],
                "reason": error_content,
            }, message="未创建沙箱任务")
        status_content = "已识别为产物型任务，沙箱任务已创建。"
        for planning_message in run.get("planningMessages") or []:
            if isinstance(planning_message, dict):
                agent_messages.append(planning_message)
        status_message = create_message(
            conversation_id=conversation_id,
            sender_id="system",
            sender_name="系统",
            role="system",
            msg_type="status",
            content=status_content,
            metadata={
                "executionMode": execution_decision["executionMode"],
                "intent": execution_decision["intent"],
                "reason": execution_decision["reason"],
            },
        )
        agent_messages.append(status_message)
        update_conversation_activity(conversation_id, status_content)
        schedule_memory_once(agent_messages)
        return ok({
            "userMessage": user_message,
            "agentMessages": agent_messages,
            "artifacts": artifacts,
            "contextUsage": build_context_usage(conversation),
            "executionMode": "sandbox",
            "intent": execution_decision["intent"],
            "reason": execution_decision["reason"],
            "run": run,
            "workspaceId": run.get("workspaceId"),
        }, message="沙箱任务已创建")

    web_search_model_user_input = model_user_input
    web_search_metadata: Optional[Dict[str, Any]] = None
    web_agent_id = target_agent.get("id") if target_agent else target_agent_id
    if conversation_allows_agent_tool(conversation, "web.search", web_agent_id):
        web_search_model_user_input, web_search_metadata = await prepare_web_search_for_chat(
            content,
            model_user_input,
            payload=payload,
            conversation=conversation,
        )

    if should_run_group_chat_collaboration(conversation, target_agent, execution_decision):
        collaboration = await run_group_chat_collaboration(
            conversation=conversation,
            user_message=user_message,
            user_input=content,
            model_user_input=model_user_input,
            artifact_ref=artifact_ref,
            web_search_metadata=web_search_metadata,
            web_search_model_user_input=web_search_model_user_input,
            execution_decision=execution_decision,
        )
        if collaboration and collaboration.get("handled"):
            agent_messages.extend(collaboration.get("agentMessages") or [])
            artifacts.extend(collaboration.get("artifacts") or [])
            schedule_memory_once(agent_messages)
            return ok({
                "userMessage": user_message,
                "agentMessages": agent_messages,
                "artifacts": artifacts,
                "contextUsage": build_context_usage(conversation),
                "executionMode": execution_decision["executionMode"],
                "intent": execution_decision["intent"],
                "reason": execution_decision["reason"],
                "taskPlan": collaboration.get("taskPlan"),
                "workspaceActionContext": collaboration.get("workspaceActionContext"),
            }, message="群聊协作已完成")

        intent_result = analyze_orchestrator_intent(content)
        if intent_result["intent"] == "chat":
            orchestrator_content = intent_result["reply"]
            if attachments or quoted_message or artifact_ref or (web_search_metadata and web_search_metadata.get("shouldSearch")):
                orchestrator_agent = get_enabled_orchestrator(conversation) or choose_agent_for_conversation(conversation)
                try:
                    orchestrator_content = await runtime_router.execute_chat(
                        orchestrator_agent,
                        conversation,
                        web_search_model_user_input,
                        chat_context,
                    )
                except Exception as exc:
                    orchestrator_content = fallback_reply(orchestrator_agent, content, exc)
            orchestrator_message = create_message(
                conversation_id=conversation_id,
                sender_id="agent-orchestrator",
                sender_name="Orchestrator",
                role="orchestrator",
                msg_type="text",
                content=orchestrator_content,
                metadata={"webSearch": web_search_metadata} if web_search_metadata else None,
            )
            agent_messages.append(orchestrator_message)
            update_conversation_activity(conversation_id, orchestrator_content)
            schedule_memory_once(agent_messages)
            return ok({
                "userMessage": user_message,
                "agentMessages": agent_messages,
                "artifacts": artifacts,
                "contextUsage": build_context_usage(conversation),
                "executionMode": execution_decision["executionMode"],
                "intent": execution_decision["intent"],
                "reason": execution_decision["reason"],
            }, message="消息发送成功")

        plan_content = format_task_plan_content(intent_result["taskPlan"])
        orchestrator_message = create_message(
            conversation_id=conversation_id,
            sender_id="agent-orchestrator",
            sender_name="Orchestrator",
            role="orchestrator",
            msg_type="task-plan",
            content=plan_content,
        )
        agent_messages.append(orchestrator_message)

    agent = target_agent or choose_agent_for_conversation(conversation)
    try:
        reply_content = await runtime_router.execute_chat(
            agent,
            conversation,
            web_search_model_user_input,
            chat_context,
        )
    except Exception as exc:
        reply_content = fallback_reply(agent, content, exc)

    role = "orchestrator" if agent and agent["id"] == "agent-orchestrator" else "agent"
    agent_message = create_message(
        conversation_id=conversation_id,
        sender_id=agent["id"] if agent else "agent-unknown",
        sender_name=agent["name"] if agent else "Agent",
        role=role,
        msg_type="text",
        content=reply_content,
        metadata={"webSearch": web_search_metadata} if web_search_metadata else None,
    )
    agent_messages.append(agent_message)
    update_conversation_activity(conversation_id, reply_content)

    artifact_result = persist_artifact_from_message(conversation_id, agent_message, artifact_ref)
    if artifact_result:
        artifacts.append({
            **artifact_result["artifact"],
            "action": artifact_result["action"],
        })
        artifact_message = artifact_result["message"]
        agent_messages.append(artifact_message)
        update_conversation_activity(conversation_id, artifact_message["content"])

    schedule_memory_once(agent_messages)
    return ok({
        "userMessage": user_message,
        "agentMessages": agent_messages,
        "artifacts": artifacts,
        "contextUsage": build_context_usage(conversation),
        "executionMode": execution_decision["executionMode"],
        "intent": execution_decision["intent"],
        "reason": execution_decision["reason"],
    }, message="消息发送成功")
