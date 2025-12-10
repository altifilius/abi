from functools import lru_cache
from pydantic import BaseSettings, Field


class Settings(BaseSettings):
    database_url: str = Field(
        default="postgresql+asyncpg://user:password@localhost:5432/abi",
        env="DATABASE_URL",
    )

    openai_api_key: str = Field(..., env="OPENAI_API_KEY")
    openai_base_url: str | None = Field(default=None, env="OPENAI_BASE_URL")
    openai_embedding_model: str = Field(default="text-embedding-3-large", env="OPENAI_EMBEDDING_MODEL")
    openai_chat_model: str = Field(default="gpt-oss-120b", env="OPENAI_CHAT_MODEL")

    embed_batch_size: int = Field(default=64, env="EMBED_BATCH_SIZE")
    embed_max_retries: int = Field(default=3, env="EMBED_MAX_RETRIES")
    embed_retry_base: float = Field(default=0.5, env="EMBED_RETRY_BASE")

    class Config:
        case_sensitive = False
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
