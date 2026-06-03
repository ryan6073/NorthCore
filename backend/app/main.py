from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import agents, artifacts, auth, conversations, deployments, messages, model_configs, runs, system, workspaces, ws
from app.app_metadata import APP_DESCRIPTION, APP_TITLE, APP_VERSION
from app.database import init_db


app = FastAPI(
    title=APP_TITLE,
    description=APP_DESCRIPTION,
    version=APP_VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    init_db()


app.include_router(system.router)
app.include_router(auth.router)
app.include_router(agents.router)
app.include_router(conversations.router)
app.include_router(messages.router)
app.include_router(model_configs.router)
app.include_router(runs.router)
app.include_router(deployments.router)
app.include_router(artifacts.router)
app.include_router(workspaces.router)
app.include_router(ws.router)


if __name__ == "__main__":
    import uvicorn

    from app.config import settings

    print(f"🚀 AgentHub 正在拉起服务，监听地址: http://{settings.HOST}:{settings.PORT}")
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
