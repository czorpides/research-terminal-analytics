"""Runtime configuration. All values are read from environment variables.

Never log or return these values to unauthenticated callers.
"""
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    service_version: str = Field(default="0.0.0")
    deploy_env: str = Field(default="local")
    log_level: str = Field(default="INFO")

    analytics_service_token: str = Field(default="")
    supabase_url: str = Field(default="")
    supabase_service_role_key: str = Field(default="")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()