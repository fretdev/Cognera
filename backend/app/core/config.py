"""
Centralized app configuration, loaded from environment variables.
Import `settings` anywhere you need a config value instead of reading
os.environ directly — keeps every secret/setting defined in one place.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str

    gemini_api_key: str
    gemini_chat_model: str = "gemini-2.5-flash-lite"
    gemini_embedding_model: str = "gemini-embedding-001"

    cors_origins: str = "http://localhost:3000"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]


settings = Settings()
