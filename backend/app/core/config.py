from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    APP_NAME: str = "Kopernik Harvest"
    SECRET_KEY: str = "kopernik-harvest-super-secret-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    DATABASE_URL: str = "sqlite:///./kopernik_harvest.db"
    DEBUG: bool = True

    class Config:
        env_file = ".env"


settings = Settings()
