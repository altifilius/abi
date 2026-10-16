from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        case_sensitive=False, env_file=ROOT / "backend" / ".env", extra="ignore"
    )

    database_url: str = "postgresql+asyncpg://abi@127.0.0.1:5432/abi"
    openai_api_key: str = ""
    openai_base_url: str | None = None
    openai_chat_model: str = "gpt-4o-mini"
    openai_idea_model: str = "gpt-4o-mini"
    openai_fund_model: str = "gpt-4o-mini"
    openai_embedding_model: str = "text-embedding-3-large"
    local_ai_base_url: str | None = None
    local_ai_api_key: str = ""
    local_ai_chat_model: str = ""
    local_ai_idea_model: str = ""
    local_ai_embedding_model: str = ""
    local_ai_reasoning_effort: Literal["none", "low", "medium", "high"] | None = None
    default_report_id: str = "default_report"
    ai_request_timeout_seconds: float = Field(default=180, ge=5, le=600)
    ai_max_context_chars: int = Field(default=24_000, ge=2_000, le=200_000)
    ai_max_output_tokens: int = Field(default=4_096, ge=128, le=32_768)
    embed_batch_size: int = Field(default=32, ge=1, le=256)
    embed_max_retries: int = Field(default=3, ge=0, le=10)
    embed_retry_base: float = Field(default=0.5, ge=0.1, le=10)

    host: str = "127.0.0.1"
    port: int = Field(default=8001, ge=1, le=65535)
    reload: bool = False
    cors_origins: str = (
        "http://127.0.0.1:8001,http://localhost:8001,http://127.0.0.1:3000,http://localhost:3000"
    )
    max_request_bytes: int = Field(default=262_144, ge=1_024, le=10_485_760)
    max_upload_bytes: int = Field(default=20 * 1024 * 1024, ge=1024, le=100 * 1024 * 1024)
    max_zip_uncompressed_bytes: int = 80 * 1024 * 1024
    max_zip_entries: int = 1000
    max_document_pages: int = 100
    max_image_pixels: int = 25_000_000
    storage_root: Path = ROOT / "var" / "private-documents"
    pdf_font_path: Path = Path("/usr/share/fonts/TTF/DejaVuSans.ttf")
    pdf_bold_font_path: Path = Path("/usr/share/fonts/TTF/DejaVuSans-Bold.ttf")
    ocr_language: str = "tur+eng"
    ocr_timeout_seconds: int = 60
    ocr_data_path: Path | None = None

    session_cookie_secure: bool = False
    session_lifetime_hours: int = Field(default=168, ge=1, le=720)
    public_app_url: str = "http://127.0.0.1:8001"
    smtp_host: str | None = None
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_security: Literal["starttls", "tls", "none"] = "starttls"
    smtp_timeout_seconds: float = 20

    @property
    def cors_origin_list(self) -> list[str]:
        origins = [
            origin.strip().rstrip("/") for origin in self.cors_origins.split(",") if origin.strip()
        ]
        if "*" in origins:
            raise ValueError("CORS_ORIGINS must list explicit origins")
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
