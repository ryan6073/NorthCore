from typing import Any, Dict, Optional

from app.runtimes.base import RuntimeAdapter, RuntimeEventEmitter
from app.runtimes.native import NativeRuntimeAdapter


class ClaudeCodeRuntimeAdapter(RuntimeAdapter):
    runtime = "claude_code"

    async def execute_chat(self, agent: Dict[str, Any], conversation: Dict[str, Any], user_input: str, context: Optional[Dict[str, Any]] = None) -> str:
        return "Claude Code platform runtime adapter 已预留，第一版暂不执行真实任务。"

    async def complete_json(self, agent: Dict[str, Any], conversation: Dict[str, Any], system_prompt: str, user_content: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return await NativeRuntimeAdapter().complete_json(agent, conversation, system_prompt, user_content, context)

    async def create_run(self, agent: Optional[Dict[str, Any]], current_user: Dict[str, Any], conversation_id: str, prompt: str, payload: Optional[Dict[str, Any]] = None, emit: Optional[RuntimeEventEmitter] = None) -> Dict[str, Any]:
        from app.services.run_service import create_run_for_conversation

        return await create_run_for_conversation(
            current_user=current_user,
            conversation_id=conversation_id,
            prompt=prompt,
            payload=payload,
            emit=emit,
            runtime_agent=agent,
        )

    async def execute_run_step(self, run_id: str, sandbox: Dict[str, Any], container_id: str, step: Dict[str, Any], agent: Optional[Dict[str, Any]], send: RuntimeEventEmitter, context: Optional[Dict[str, Any]] = None) -> bool:
        from app.database import update_agent_run_step

        error = "Claude Code platform runtime adapter 已预留，暂未接入真实执行器"
        update_agent_run_step(
            step["id"],
            status="failed",
            error=error,
            mark_finished=True,
            runtime_metadata={"runtime": "claude_code", "error": error},
        )
        await send("run.step.failed", {"runId": run_id, "stepId": step["id"], "step": {**step, "status": "failed"}, "error": error})
        return True
