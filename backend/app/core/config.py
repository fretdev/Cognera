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
    gemini_api_keys: str = ""
    gemini_chat_model: str = "gemini-2.0-flash-lite"
    gemini_embedding_model: str = "gemini-embedding-001"

    openrouter_api_key: str = ""
    openrouter_api_keys: str = ""
    groq_api_key: str = ""
    groq_api_keys: str = ""
    preferred_chat_provider: str = "auto"

    cors_origins: str = "http://localhost:3000,https://cognera-8usb.vercel.app"

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        env_mapping={
            "cors_origins": "CORS_ORIGINS"
        }
    )

    @property
    def cors_origin_list(self) -> list[str]:
        # If someone put a comma-separated string or just a single URL
        raw = self.cors_origins.strip()
        if not raw:
            return ["*"]
        return [origin.strip() for origin in raw.split(",") if origin.strip()]


settings = Settings()
