from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# 动态定位项目根目录（即 .env 所在的目录）
# __file__ 是 app/config.py，它的父目录的父目录就是项目根目录
ROOT_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    # ==================== 基础服务配置 ====================
    PORT: int = 8000
    HOST: str = "0.0.0.0"
    
    # ==================== 大模型凭证 (无默认值，必填) ====================
    ARK_API_KEY: str
    ARK_BASE_URL: str
    MODEL_EP: str

    # ==================== 混合数据库配置 (选填，带默认值) ====================
    REDIS_URL: str = "redis://localhost:6379/0"
    DATABASE_URL: str = "sqlite:///./agenthub.db" # 默认先用轻量级 SQLite 跑通，后面可换 PG/MySQL

    # ==================== Pydantic 配置项 ====================
    # 通过 SettingsConfigDict 声明直接读取根目录下的 .env 文件
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=True  # 严格区分大小写，保持环境变量命名规范
    )

# 实例化全局配置对象
settings = Settings()
