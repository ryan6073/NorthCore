import asyncio
import json
from fastapi import WebSocket
from openai import OpenAI

from app.config import settings
from app.core.orchestrator import AGENT_CONFIGS, generate_pipeline_plan
from app.database import get_chat_history, save_message

client = OpenAI(api_key=settings.ARK_API_KEY, base_url=settings.ARK_BASE_URL)

async def call_agent_stream(websocket: WebSocket, session_id: str, agent_name: str, system_prompt: str, user_prompt: str) -> str:
    """流式调用大模型，实时推送 Chunk，并追加入上下文"""
    full_response_text = ""
    try:
        # 获取包含历史的完整上下文
        history = get_chat_history(session_id)
        messages = [{"role": "system", "content": system_prompt}] + history
        
        # 如果有当前用户/上游传过来的提示词，追加进去
        if user_prompt:
            messages.append({"role": "user", "content": user_prompt})

        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=settings.MODEL_EP,
            messages=messages,
            stream=True
        )

        for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                token = chunk.choices[0].delta.content
                full_response_text += token
                
                # 实时推送至前端
                await websocket.send_json({
                    "type": "chunk",
                    "agent": agent_name,
                    "content": token
                })
                await asyncio.sleep(0.001)
                
        # 实时生成完后，持久化到内存数据库中，保持上下文连续
        save_message(session_id, role="assistant", agent_name=agent_name, content=full_response_text, msg_type="text")
        return full_response_text

    except Exception as e:
        error_msg = f"\n❌ [API 调用发生错误]: {str(e)}"
        await websocket.send_json({"type": "chunk", "agent": agent_name, "content": error_msg})
        return f"错误: {str(e)}"

async def handle_websocket_message(websocket: WebSocket, data_text: str):
    """处理前端发来的会话数据"""
    message_data = json.loads(data_text)
    user_input = message_data.get("text", "").strip()
    chat_type = message_data.get("type", "single")
    selected_agent = message_data.get("agent", "Claude Code")
    session_id = message_data.get("session_id", "default_session") # 支撑多会话并行

    if not user_input:
        return

    # 1. 存入用户发送的消息
    save_message(session_id, role="user", agent_name="User", content=user_input, msg_type="text")

    # 2. 模式切换与调度
    if chat_type == "group" or "@" in user_input:
        await websocket.send_json({"type": "status", "content": "🧠 Orchestrator 正在分析意图并规划流水线..."})
        
        # 调用调度器切分任务
        plan = generate_pipeline_plan(user_input)
        last_artifact_context = "" 
        
        for step in plan:
            target_agent = step.get("agent", "Claude Code")
            task_desc = step.get("task", "")
            
            await websocket.send_json({"type": "status", "content": f"⚡ 正在分派任务给 [{target_agent}]..."})
            await asyncio.sleep(0.3)

            # 串联上下游上下文
            if not last_artifact_context:
                current_prompt = f"用户原始主诉：{user_input}。请执行你的拆解任务：{task_desc}"
            else:
                current_prompt = f"基于前一个智能体的产出内容：\n{last_artifact_context}\n\n请执行你的拆解任务：{task_desc}"
            
            # 执行子 Agent 生产
            last_artifact_context = await call_agent_stream(
                websocket, 
                session_id=session_id,
                agent_name=target_agent, 
                system_prompt=AGENT_CONFIGS.get(target_agent, AGENT_CONFIGS["Claude Code"])["system"],
                user_prompt=current_prompt
            )
            await websocket.send_json({"type": "status", "content": f"✅ [{target_agent}] 任务处理完毕。"})
            
    else:
        # 1v1 单聊模式
        await websocket.send_json({"type": "status", "content": f"🤖 {selected_agent} 正在思考..."})
        await call_agent_stream(
            websocket,
            session_id=session_id,
            agent_name=selected_agent,
            system_prompt=AGENT_CONFIGS.get(selected_agent, AGENT_CONFIGS["Claude Code"])["system"],
            user_prompt=user_input
        )