from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


DEFAULT_JWT_SECRET = "change-me-in-production-use-a-strong-random-secret-at-least-32-bytes"
MIN_JWT_SECRET_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://cadstudio:cadstudio@localhost:5432/cadstudio"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # MinIO / S3
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "cad-studio"
    MINIO_SECURE: bool = False

    # JWT
    JWT_SECRET: str = DEFAULT_JWT_SECRET
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15

    # Refresh Token
    REFRESH_TOKEN_BYTES: int = 32
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    COOKIE_SECURE: bool = True

    # Rate limiting
    TRUSTED_PROXIES: str = "127.0.0.1/32,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
    LOGIN_IP_FAILURE_LIMIT: int = 10
    LOGIN_IP_WINDOW_SECONDS: int = 60
    LOGIN_EMAIL_FAILURE_LIMIT: int = 5
    LOGIN_EMAIL_WINDOW_SECONDS: int = 900
    REGISTER_IP_LIMIT: int = 10
    REGISTER_IP_WINDOW_SECONDS: int = 3600
    REFRESH_IP_LIMIT: int = 300
    REFRESH_IP_WINDOW_SECONDS: int = 60

    # Quotas
    MAX_PROJECTS_PER_USER: int = 200
    MAX_STORAGE_BYTES_PER_USER: int = 1024 * 1024 * 1024
    MAX_API_KEYS_PER_USER: int = 10

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173"

    # App
    DEBUG: bool = False
    APP_NAME: str = "Крометра"
    APP_VERSION: str = "0.1.0"

    @model_validator(mode="after")
    def reject_default_secrets_in_production(self) -> "Settings":
        if self.DEBUG:
            return self
        defaults = {
            "JWT_SECRET": self.JWT_SECRET == DEFAULT_JWT_SECRET or len(self.JWT_SECRET) < MIN_JWT_SECRET_LENGTH,
            "MINIO_ACCESS_KEY": self.MINIO_ACCESS_KEY == "minioadmin",
            "MINIO_SECRET_KEY": self.MINIO_SECRET_KEY == "minioadmin",
            "DATABASE_URL": ":cadstudio@" in self.DATABASE_URL,
        }
        leaked = [name for name, is_default in defaults.items() if is_default]
        if leaked:
            raise ValueError(f"Секреты по умолчанию или слишком короткие при DEBUG=false: {', '.join(leaked)}")
        return self


@lru_cache()
def get_settings() -> Settings:
    return Settings()
