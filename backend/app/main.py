import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.websocket.handler import handle_websocket_message

# 初始化工业级 FastAPI 实例
app = FastAPI(
    title="AgentHub API Platform",
    description="多 Agent 协作平台后端核心中枢 - 支持多会话、混合记忆与实时沙箱 HMR",
    version="1.0.0"
)

# 配置大厂规范的跨域资源共享 (CORS) 策略
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket 实时交互长连接端点
    接管全流式单聊 (1v1) 与 Orchestrator 群聊分布式状态编排
    """
    await websocket.accept()
    try:
        while True:
            # 接收前端打包传送过来的复杂 JSON 数据
            data_text = await websocket.receive_text()
            
            # 分流并路由至专职的业务处理器，由其完成关系映射、上下文组装及流式吞吐
            await handle_websocket_message(websocket, data_text)
            
    except WebSocketDisconnect:
        # 优雅捕获客户端安全断开状态，避免控制台溢出错误堆栈
        print("💡 [WebSocket System]: 客户端连接已安全断开")
    except Exception as e:
        print(f"❌ [WebSocket System Error]: 运行时捕获异常: {str(e)}")

# =====================================================================
#  MVP 阶段前端静态沙箱与视图就地挂载 (适配你的本地项目调试)
# =====================================================================

@app.get("/", response_class=HTMLResponse)
async def get_index():
    """根路径默认返回单页应用骨架 index.html"""
    if os.path.exists("index.html"):
        with open("index.html", "r", encoding="utf-8") as f:
            return f.read()
    return (
        "<div style='text-align:center; margin-top:20%; font-family:sans-serif;'>"
        "<h1>🚀 AgentHub Backend 运行成功</h1>"
        "<p style='color:#666;'>未检测到 index.html，请确保前端静态资源放置在根目录下</p>"
        "</div>"
    )

@app.get('/favicon.ico', include_in_schema=False)
async def favicon():
    """修复浏览器默认请求 favicon 导致的 502/404 挂起隐患"""
    if os.path.exists("favicon.ico"):
        return FileResponse("favicon.ico")
    return Response(status_code=204)

# 动态挂载根目录下所有的静态资产 (如 main.js, css 等) 
# 这允许你在本地以单一服务形式流畅跑通全栈应用
app.mount("/", StaticFiles(directory="."), name="static")

if __name__ == "__main__":
    import uvicorn
    # 通过统一配置中心加载 HOST 和 PORT，与 .env 变量强绑定
    print(f"🚀 AgentHub 正在拉起服务，监听地址: http://{settings.HOST}:{settings.PORT}")
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)