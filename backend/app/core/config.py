"""
Core Configuration
Environment-based settings for the application
"""

from pydantic_settings import BaseSettings
from typing import List
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings"""
    
    # Environment
    ENVIRONMENT: str = "development"  # development, staging, production
    DEBUG: bool = True
    
    # API
    API_V1_PREFIX: str = "/v1"
    PROJECT_NAME: str = "Beverage Inventory Platform"
    VERSION: str = "1.1.0"
    
    # Database
    DATABASE_URL: str = "postgresql://user:password@localhost:5432/inventory_db"
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    
    # Security
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:19006"  # Expo
    ]
    
    # Redis (for workers)
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Workers
    WORKER_CONCURRENCY: int = 4
    
    # POS Integration
    TOAST_SFTP_HOST: str = ""
    TOAST_SFTP_USER: str = ""
    TOAST_SFTP_PASSWORD: str = ""
    TOAST_SFTP_PATH: str = "/exports"
    
    # Business Logic
    DEFAULT_TIMEZONE: str = "America/Montreal"
    DEFAULT_CLOSEOUT_HOUR: int = 4
    VARIANCE_THRESHOLD_PERCENT: float = 5.0
    
    # Storage
    UPLOAD_DIR: str = "/tmp/uploads"
    EXPORT_DIR: str = "/tmp/exports"
    
    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()


# Global settings instance
settings = get_settings()
