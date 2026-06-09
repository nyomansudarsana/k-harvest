from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    APP_NAME: str = "Kopernik Harvest"
    SECRET_KEY: str = "kopernik-harvest-super-secret-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    DATABASE_URL: str = "sqlite:///./kopernik_harvest.db"
    DEBUG: bool = True
    # Comma-separated list of allowed CORS origins
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173"

    class Config:
        env_file = ".env"


settings = Settings()
