from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


API_ROOT = Path(__file__).resolve().parents[2]
WORKSPACE_ROOT = API_ROOT.parents[1]


class Settings(BaseSettings):
    app_name: str = "workflow-engine-api"
    app_env: str = "development"
    web_app_url: str = "http://localhost:3000"
    workflow_database_url: str = (
        "postgresql://USER:PASSWORD@YOUR_NEON_HOST/neondb?sslmode=require"
    )
    rabbitmq_url: str = "amqp://workflow:workflow@localhost:5672/"
    better_auth_issuer: str = "http://localhost:3000"
    better_auth_audience: str = "http://localhost:3000"
    better_auth_jwks_url: str = "http://localhost:3000/api/auth/jwks"

    model_config = SettingsConfigDict(
        env_file=(API_ROOT / ".env", WORKSPACE_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
