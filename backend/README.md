``` python
# 1. 确保进入了后端根目录
cd backend

# 2. 激活你的 Python 虚拟环境 (根据你的习惯选择：venv/uv/conda)
# 如果使用 uv: uv sync 之后
# source .venv/bin/activate

# 3. 模块化拉起 Uvicorn 服务
python -m uvicorn app.main:app --host 0.0.0.0 --port 9006 --reload
```