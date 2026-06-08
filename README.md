# NorthCore / AgentHub

这是 AgentHub 的本地联调入口。后端在 `backend/`，前端在 `frontend/`。

## 最小联调命令

1. 启动后端：

```bash
cd backend
uv venv .venv
source .venv/bin/activate
uv pip install -r requirement.txt
cp .env.example .env
python -m uvicorn app.main:app --host 0.0.0.0 --port 9007 --reload
```

2. 启动前端：

```bash
cd frontend
npm install
VITE_USE_MOCK=false VITE_API_BASE_URL=http://localhost:9007/api/v1 VITE_WS_URL=ws://localhost:9007/ws npm run dev
```

3. 验证后端：

```bash
curl http://localhost:9007/api/v1/health
```

如果后端不用 `9007`，把前端命令里的 `VITE_API_BASE_URL` 和 `VITE_WS_URL` 改成同一个端口。

## 目录

```text
backend/   FastAPI + SQLite 后端
frontend/  Vite + React 前端
mobile/    移动端实验目录
desktop/   桌面端实验目录
```

更多后端接口、Agent、鉴权和环境变量说明见 `backend/README.md`。
