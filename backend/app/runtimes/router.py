from typing import Any, Dict, Optional

from app.runtimes.base import RuntimeAdapter, RuntimeEventEmitter
from app.runtimes.claude_code import ClaudeCodeRuntimeAdapter
from app.runtimes.codex import CodexRuntimeAdapter
from app.runtimes.native import NativeRuntimeAdapter
from app.runtimes.opencode import OpenCodeRuntimeAdapter


class RuntimeRouter:
    def __init__(self) -> None:
        self.adapters: Dict[str, RuntimeAdapter] = {
            "native": NativeRuntimeAdapter(),
            "opencode": OpenCodeRuntimeAdapter(),
            "codex": CodexRuntimeAdapter(),
            "claude_code": ClaudeCodeRuntimeAdapter(),
            "claude-code": ClaudeCodeRuntimeAdapter(),
    }

    def adapter_for_agent(self, agent: Optional[Dict[str, Any]]) -> RuntimeAdapter:
        runtime = str((agent or {}).get("runtime") or "native").strip().lower() or "native"
        return self.adapters.get(runtime, self.adapters["native"])

    async def execute_chat(
        self,
        agent: Dict[str, Any],
        conversation: Dict[str, Any],
        user_input: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> str:
        return await self.adapter_for_agent(agent).execute_chat(agent, conversation, user_input, context)

    async def complete_json(
        self,
        agent: Dict[str, Any],
        conversation: Dict[str, Any],
        system_prompt: str,
        user_content: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return await self.adapter_for_agent(agent).complete_json(agent, conversation, system_prompt, user_content, context)

    async def create_run(
        self,
        agent: Optional[Dict[str, Any]],
        current_user: Dict[str, Any],
        conversation_id: str,
        prompt: str,
        payload: Optional[Dict[str, Any]] = None,
        emit: Optional[RuntimeEventEmitter] = None,
    ) -> Dict[str, Any]:
        return await self.adapter_for_agent(agent).create_run(agent, current_user, conversation_id, prompt, payload, emit)

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
        return await self.adapter_for_agent(agent).execute_run_step(run_id, sandbox, container_id, step, agent, send, context)


runtime_router = RuntimeRouter()
