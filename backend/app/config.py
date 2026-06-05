from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# 动态定位项目根目录（即 .env 所在的目录）
# __file__ 是 app/config.py，它的父目录的父目录就是项目根目录
ROOT_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    # ==================== 基础服务配置 ====================
    PORT: int = 9
    HOST: str = "0.0.0.0"
    ENABLE_API_DOCS: bool = True
    CORS_ALLOW_ORIGINS: str = ""
    CORS_ALLOW_ORIGIN_REGEX: str = "https?://.*"
    PUBLIC_BASE_URL: str = ""
    
    # ==================== 大模型凭证 (无默认值，必填) ====================
    ARK_API_KEY: str
    ARK_BASE_URL: str
    MODEL_EP: str
    AGENT_SECRET_KEY: str = "agenthub-local-dev-secret"

    # ==================== 混合数据库配置 (选填，带默认值) ====================
    REDIS_URL: str = "redis://localhost:6379/0"
    DATABASE_URL: str = "sqlite:///./agenthub.db" # 默认先用轻量级 SQLite 跑通，后面可换 PG/MySQL

    # ==================== 沙箱执行配置 ====================
    SANDBOX_IMAGE: str = "python:3.11-slim"
    SANDBOX_NETWORK: str = "bridge"
    SANDBOX_ALLOW_NETWORK: bool = True
    SANDBOX_AUTO_INSTALL_UV: bool = True
    SANDBOX_TIMEOUT_SECONDS: int = 1800
    SANDBOX_COMMAND_TIMEOUT_SECONDS: int = 1800
    SANDBOX_VALIDATION_TIMEOUT_SECONDS: int = 120
    SANDBOX_SETUP_TIMEOUT_SECONDS: int = 900
    SANDBOX_MAX_PARALLEL_STEPS: int = 2
    SANDBOX_WORKSPACE_ROOT: str = "/tmp/agenthub-sandboxes"
    SANDBOX_MAX_OUTPUT_CHARS: int = 100000
    SANDBOX_MAX_OUTPUT_BYTES: int = 100000
    SANDBOX_MAX_TOOL_ITERATIONS: int = 20
    SANDBOX_AUTO_RETRY_ENABLED: bool = True
    SANDBOX_AUTO_RETRY_MAX_ATTEMPTS: int = 5
    SANDBOX_KEEP_WORKSPACE_ON_STATUSES: str = "failed,conflict,cancelled"
    SANDBOX_CLEANUP_COMPLETED_WORKSPACE: bool = True
    SANDBOX_WORKSPACE_SCAN_MAX_FILES: int = 500
    SANDBOX_WORKSPACE_FILE_MAX_BYTES: int = 200000
    WORKSPACE_FILE_PREVIEW_MAX_BYTES: int = 1000000
    WORKSPACE_FILE_EDIT_MAX_BYTES: int = 1000000
    WORKSPACE_UPLOAD_MAX_BYTES: int = 20000000
    WORKSPACE_TREE_MAX_DEPTH: int = 6
    WORKSPACE_TREE_MAX_ENTRIES: int = 2000
    SANDBOX_CPUS: str = "1.0"
    SANDBOX_MEMORY: str = "512m"
    SANDBOX_PIDS_LIMIT: int = 128
    SANDBOX_RUN_AS_USER: str = "1000:1000"
    SANDBOX_READ_ONLY_ROOTFS: bool = False

    # ==================== 上传附件配置 ====================
    ATTACHMENT_STORAGE_ROOT: str = "/tmp/agenthub-attachments"
    ATTACHMENT_MAX_BYTES: int = 50000000
    ATTACHMENT_CONTEXT_MAX_CHARS: int = 20000
    ATTACHMENT_SUMMARY_MAX_SOURCE_CHARS: int = 6000
    ATTACHMENT_VISION_ENABLED: bool = True
    ATTACHMENT_VISION_MAX_BYTES: int = 10000000
    ATTACHMENT_ZIP_MAX_FILES: int = 100
    ATTACHMENT_ZIP_MAX_UNCOMPRESSED_BYTES: int = 100000000
    ATTACHMENT_ZIP_ENTRY_MAX_BYTES: int = 10000000

    # ==================== Agent Runtime 配置 ====================
    OPENCODE_BIN: str = "opencode"
    OPENCODE_TIMEOUT_SECONDS: int = 600
    CODEX_BIN: str = "codex"
    CODEX_TIMEOUT_SECONDS: int = 600
    CODEX_HOME_ROOT: str = ""
    RUNTIME_HOME_ROOT: str = ""
    CLAUDE_CODE_BIN: str = "claude"
    CLAUDE_CODE_TIMEOUT_SECONDS: int = 600

    # ==================== Workspace 部署配置 ====================
    DEPLOY_BASE_URL: str = ""
    DEPLOY_DOCKER_BIN: str = "docker"
    DEPLOY_TIMEOUT_SECONDS: int = 900
    DEPLOY_PORT_MIN: int = 31000
    DEPLOY_PORT_MAX: int = 39999
    DEPLOY_WORKDIR_ROOT: str = "/tmp/agenthub-deployments"

    # ==================== 联网搜索配置 ====================
    WEB_SEARCH_ENABLED: bool = True
    WEB_SEARCH_PROVIDER: str = "ddgs"
    WEB_SEARCH_MAX_RESULTS: int = 10
    WEB_SEARCH_CONTEXT_MAX_RESULTS: int = 5
    WEB_SEARCH_BODY_MAX_CHARS: int = 500
    WEB_SEARCH_QUERY_MAX_CHARS: int = 300
    WEB_SEARCH_FETCH_MAX_RESULTS: int = 3
    WEB_SEARCH_FETCH_MAX_BYTES: int = 1000000
    WEB_SEARCH_PAGE_MAX_CHARS: int = 12000
    WEB_SEARCH_CONTEXT_MAX_CHARS: int = 30000
    WEB_SEARCH_FETCH_TIMEOUT_SECONDS: int = 8
    WEB_SEARCH_TIMEOUT_SECONDS: int = 8
    WEB_SEARCH_CACHE_TTL_SECONDS: int = 3600
    WEB_SEARCH_REGION: str = "wt-wt"
    WEB_SEARCH_SAFESEARCH: str = "moderate"

    # ==================== Pydantic 配置项 ====================
    # 通过 SettingsConfigDict 声明直接读取根目录下的 .env 文件
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=True  # 严格区分大小写，保持环境变量命名规范
    )

# 实例化全局配置对象
settings = Settings()
