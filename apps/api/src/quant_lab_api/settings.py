"""Runtime settings — local SQLite by default; Postgres via DATABASE_URL."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "quant-lab-api"
    environment: str = "local"
    # Default to SQLite so Phase 2 works without Docker; override for Postgres/Cloud SQL.
    database_url: str = "sqlite+pysqlite:///./var/quantlab.db"
    object_store_uri: str = "local://./var/objects"
    service_shared_secret: str = "dev-shared-secret-change-me"
    invite_code: str = "quant-lab-invite"
    jwt_secret: str = "dev-jwt-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 24
    agent_base_url: str = "http://localhost:8081"
    cors_origins: str = "http://localhost:5173"
    job_sync_default: bool = True

    # LLM — primary vs lite (test + context compact); DeepSeek via Pi
    llm_default_provider: str = "google"
    llm_primary_model: str = "gemini-3.8-flash"
    llm_lite_model: str = "gemini-3.1-flash-lite"
    llm_deepseek_model: str = "deepseek-chat"
    llm_api_key: str = ""  # Gemini / Google
    gemini_api_key: str = ""
    deepseek_api_key: str = ""

    @property
    def object_store_root(self) -> Path:
        uri = self.object_store_uri
        if uri.startswith("local://"):
            return Path(uri[len("local://") :]).resolve()
        return Path("./var/objects").resolve()

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def effective_gemini_key(self) -> str:
        return self.gemini_api_key or self.llm_api_key


def get_settings() -> Settings:
    return Settings()
