import asyncio
import json
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Response  # 🔥 修复：从 fastapi 模块引入 Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化火山方舟客户端
client = OpenAI(
    api_key="...",
    base_url="..."
)
MODEL_EP = "ep-20260508214225-g6x7g"

# 定义不同智能体的专属人格与能力边界 (Spec/Skills 沉淀)
AGENT_CONFIGS = {
    "Claude Code": {
        "system": "你是一个精通全栈开发的 AI 工程师。请直接根据用户的要求编写高质量的代码产物。当用户要求制作、构建或修改网页/UI时，你**必须且只能**输出包含在 ```html ... ``` 代码块中的完整单文件 HTML（包含 Tailwind CSS 样式）。不要说废话，直接开始编写或回答。"
    },
    "Codex": {
        "system": "你是一个资深的架构师和代码审查（Code Review）专家。你的任务是分析、评审其他 Agent 生成的代码或方案。请用严谨、专业的学术及工程语言，指出其优缺点，并给出优化建议。"
    },
    "Orchestrator": {
        "system": "你是一个高层任务协调器。你的职责是将用户复杂的开发需求拆解，并分派给合适的子 Agent（'Claude Code' 负责写代码，'Codex' 负责代码审查）。你必须输出一个标准的 JSON 数组，格式形如：[{\"agent\": \"Claude Code\", \"task\": \"具体任务\"}, {\"agent\": \"Codex\", \"task\": \"具体任务\"}]。不要输出任何其他文本。"
    }
}

# 真正的火山方舟流式调用工具函数
async def call_ark_agent_stream(websocket: WebSocket, agent_name: str, system_prompt: str, user_prompt: str):
    full_response_text = "" # 记录本次生成的完整文本内容
    try:
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=MODEL_EP,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            stream=True
        )

        for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                token = chunk.choices[0].delta.content
                full_response_text += token # 实时累加
                await websocket.send_json({
                    "type": "chunk",
                    "agent": agent_name,
                    "content": token
                })
                await asyncio.sleep(0.001)
                
        return full_response_text # 返回给调度层作为上下文传给下一个 Agent

    except Exception as e:
        await websocket.send_json({
            "type": "chunk",
            "agent": agent_name,
            "content": f"\n❌ [API 调用发生错误]: {str(e)}"
        })
        return f"错误: {str(e)}"

@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            user_input = message_data.get("text", "")
            chat_type = message_data.get("type", "single")
            selected_agent = message_data.get("agent", "Claude Code")

            # 模式 1：群聊协作模式 (Orchestrator 调度)
            if chat_type == "group" or "@" in user_input:
                await websocket.send_json({"type": "status", "content": "🧠 Orchestrator 正在分析意图并规划流水线..."})
                
                try:
                    orchestrator_res = client.chat.completions.create(
                        model=MODEL_EP,
                        messages=[
                            {"role": "system", "content": AGENT_CONFIGS["Orchestrator"]["system"]},
                            {"role": "user", "content": f"请拆解以下用户任务：'{user_input}'"}
                        ]
                    )
                    plan_text = orchestrator_res.choices[0].message.content.strip()
                    plan = json.loads(plan_text)
                except Exception:
                    plan = [
                        {"agent": "Claude Code", "task": f"请围绕以下需求编写完整的前端代码：{user_input}"},
                        {"agent": "Codex", "task": "请对刚刚生成的代码进行细致的 Code Review。"}
                    ]

                last_artifact_context = "" # 用于串联上下游上下文
                for step in plan:
                    target_agent = step.get("agent", "Claude Code")
                    task_desc = step.get("task", "")
                    
                    await websocket.send_json({"type": "status", "content": f"⚡ 正在分派任务给 [{target_agent}]..."})
                    await asyncio.sleep(0.5)

                    current_prompt = task_desc if not last_artifact_context else f"基于前一个智能体的产出内容：\n{last_artifact_context}\n\n请执行你的任务：{task_desc}"
                    
                    # 🔥 修复：将上游 Agent 流式产生的最新代码/数据完美截获，无缝喂给下一个 Agent
                    last_artifact_context = await call_ark_agent_stream(
                        websocket, 
                        agent_name=target_agent, 
                        system_prompt=AGENT_CONFIGS.get(target_agent, AGENT_CONFIGS["Claude Code"])["system"],
                        user_prompt=current_prompt
                    )
                    await websocket.send_json({"type": "status", "content": f"✅ [{target_agent}] 任务处理完毕。"})

            # 模式 2：1v1 单聊模式
            else:
                await websocket.send_json({"type": "status", "content": f"🤖 {selected_agent} 正在思考..."})
                await call_ark_agent_stream(
                    websocket,
                    agent_name=selected_agent,
                    system_prompt=AGENT_CONFIGS.get(selected_agent, AGENT_CONFIGS["Claude Code"])["system"],
                    user_prompt=user_input
                )

    except WebSocketDisconnect:
        print("Client disconnected")

@app.get("/", response_class=HTMLResponse)
async def get_index():
    if os.path.exists("index.html"):
        with open("index.html", "r", encoding="utf-8") as f:
            return f.read()
    return "<h1>未找到 index.html</h1>"

@app.get('/favicon.ico', include_in_schema=False)
async def favicon():
    # 检查当前目录下是否存在图标文件
    if os.path.exists("favicon.ico"):
        return FileResponse("favicon.ico")
    # 🔥 修复：此时返回的是正统的 FastAPI 204 响应，绝对不会引发代理层 502
    return Response(status_code=204)

app.mount("/", StaticFiles(directory="."), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=9005, reload=True)