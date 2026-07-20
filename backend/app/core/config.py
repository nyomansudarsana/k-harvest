from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    APP_NAME: str = "Kopernik Harvest"
    SECRET_KEY: str = "kopernik-harvest-super-secret-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    DATABASE_URL: str = "sqlite:///./kopernik_harvest.db"
    DEBUG: bool = True
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173"

    # Email / SMTP — set EMAIL_ENABLED=true and fill SMTP_* to activate
    EMAIL_ENABLED: bool = False
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""
    SMTP_FROM_NAME: str = "Kopernik Harvest"

    # Frontend base URL — used to build task deep-links in emails
    APP_BASE_URL: str = "http://localhost:5173"

    class Config:
        env_file = ".env"


settings = Settings()
