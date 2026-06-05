import asyncio
import json
import re
from typing import Any, Dict, Optional

from app.runtimes.base import RuntimeAdapter, RuntimeEventEmitter


def _extract_json_object(text: str) -> Dict[str, Any]:
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


class NativeRuntimeAdapter(RuntimeAdapter):
    runtime = "native"

    async def execute_chat(
        self,
        agent: Dict[str, Any],
        conversation: Dict[str, Any],
        user_input: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> str:
        from app.services.message_service import call_agent_once

        return await call_agent_once(
            conversation["id"],
            agent,
            user_input,
            exclude_message_id=(context or {}).get("excludeMessageId"),
            vision_attachments=(context or {}).get("visionAttachments"),
        )

    async def complete_json(
        self,
        agent: Dict[str, Any],
        conversation: Dict[str, Any],
        system_prompt: str,
        user_content: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        from app.model_providers.service import create_openai_client_for_agent, model_name_for_agent

        owner_user_id = agent.get("ownerUserId") if agent else conversation.get("ownerUserId")
        agent_client = create_openai_client_for_agent(agent, owner_user_id=owner_user_id)
        response = await asyncio.to_thread(
            agent_client.chat.completions.create,
            model=model_name_for_agent(agent, owner_user_id=owner_user_id),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            stream=False,
        )
        try:
            return _extract_json_object(response.choices[0].message.content or "")
        except Exception as exc:
            raise ValueError(f"模型未返回有效 JSON: {exc}") from exc

    async def create_run(
        self,
        agent: Optional[Dict[str, Any]],
        current_user: Dict[str, Any],
        conversation_id: str,
        prompt: str,
        payload: Optional[Dict[str, Any]] = None,
        emit: Optional[RuntimeEventEmitter] = None,
    ) -> Dict[str, Any]:
        from app.services.run_service import create_run_for_conversation

        return await create_run_for_conversation(
            current_user=current_user,
            conversation_id=conversation_id,
            prompt=prompt,
            payload=payload,
            emit=emit,
            runtime_agent=agent,
        )

    async def execute_run_step(
        self,
        run_id: str,
        sandbox: Dict[str, Any],
        container_id: str,
        step: Dict[str, Any],
        agent: Optional[Dict[str, Any]],
        send: RuntimeEventEmitter,
        context: Optional[Dict[str, Any]] = None,
    ) -> bool:
        return False
