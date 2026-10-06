from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = Field(
        default="postgresql+asyncpg://user:password@localhost:5432/abi",
        env="DATABASE_URL",
    )

    openai_api_key: str = Field(..., env="OPENAI_API_KEY")
    openai_base_url: str | None = Field(default=None, env="OPENAI_BASE_URL")
    openai_embedding_model: str = Field(default="text-embedding-3-large", env="OPENAI_EMBEDDING_MODEL")
    openai_chat_model: str = Field(default="gpt-oss-120b", env="OPENAI_CHAT_MODEL")
    openai_idea_model: str = Field(default="gpt-4.1", env="OPENAI_IDEA_MODEL")
    openai_fund_model: str = Field(default="gpt-4.1-mini", env="OPENAI_FUND_MODEL")
    default_report_id: str = Field(default="default_report", env="DEFAULT_REPORT_ID")

    embed_batch_size: int = Field(default=64, ge=1, le=256, env="EMBED_BATCH_SIZE")
    embed_max_retries: int = Field(default=3, ge=0, le=10, env="EMBED_MAX_RETRIES")
    embed_retry_base: float = Field(default=0.5, ge=0.1, le=10, env="EMBED_RETRY_BASE")

    host: str = Field(default="127.0.0.1", env="HOST")
    port: int = Field(default=8000, ge=1, le=65535, env="PORT")
    reload: bool = Field(default=False, env="RELOAD")
    cors_origins: str = Field(
        default="http://127.0.0.1:3000,http://localhost:3000",
        env="CORS_ORIGINS",
    )
    max_request_bytes: int = Field(
        default=262_144,
        ge=1_024,
        le=10_485_760,
        env="MAX_REQUEST_BYTES",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        origins = [origin.strip().rstrip("/") for origin in self.cors_origins.split(",") if origin.strip()]
        if "*" in origins:
            raise ValueError("CORS_ORIGINS must list explicit origins; wildcard origins are forbidden")
        return origins

    class Config:
        case_sensitive = False
        env_file = ".env"

@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
