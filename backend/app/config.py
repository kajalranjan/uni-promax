from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App settings, read from environment variables or backend/.env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_secret_key: str = ""
    cors_origins: str = "http://localhost:8081"

    # AI (Google Gemini). Without a key the app still works using simple
    # built-in estimates, and the assistant says it isn't set up yet.
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"

    # All ASU campuses are in Arizona (no daylight saving time).
    timezone: str = "America/Phoenix"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)


@lru_cache
def get_settings() -> Settings:
    return Settings()
