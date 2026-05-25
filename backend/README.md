# AgentHub Backend

FastAPI backend for the AgentHub MVP. The current stage provides SQLite persistence and P0 HTTP APIs for frontend integration.

## Run

```bash
cd backend
source .venv/bin/activate
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Environment

Create `backend/.env` from `.env.example` and fill model credentials:

```text
PORT=8000
HOST=0.0.0.0
ARK_API_KEY="your_key"
ARK_BASE_URL="your_base_url"
MODEL_EP="your_model_endpoint"
DATABASE_URL="sqlite:///./agenthub.db"
```

## P0 APIs

Base URL:

```text
http://localhost:8000/api/v1
```

Implemented:

```text
GET  /health
GET  /agents
GET  /agents/{agentId}
PUT  /agents/{agentId}
GET  /conversations
POST /conversations
GET  /conversations/{conversationId}
PUT  /conversations/{conversationId}
DELETE /conversations/{conversationId}
GET  /conversations/{conversationId}/messages
POST /conversations/{conversationId}/messages
GET  /conversations/{conversationId}/artifacts
GET  /artifacts/{artifactId}
PUT  /artifacts/{artifactId}
```

## Docs

- API contract: `../docs/api_contract.md`
- SQLite schema: `../docs/database_schema.md`
- Architecture: `../docs/technical_architecture.md`
