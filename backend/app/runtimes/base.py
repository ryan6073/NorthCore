from typing import Any, Awaitable, Callable, Dict, Optional

RuntimeEventEmitter = Callable[[str, Dict[str, Any]], Awaitable[None]]


class RuntimeAdapter:
    runtime = "native"

    async def execute_chat(
        self,
        agent: Dict[str, Any],
        conversation: Dict[str, Any],
        user_input: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> str:
        raise NotImplementedError

    async def complete_json(
        self,
        agent: Dict[str, Any],
        conversation: Dict[str, Any],
        system_prompt: str,
        user_content: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        raise NotImplementedError

    async def create_run(
        self,
        agent: Optional[Dict[str, Any]],
        current_user: Dict[str, Any],
        conversation_id: str,
        prompt: str,
        payload: Optional[Dict[str, Any]] = None,
        emit: Optional[RuntimeEventEmitter] = None,
    ) -> Dict[str, Any]:
        raise NotImplementedError

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
        raise NotImplementedError
