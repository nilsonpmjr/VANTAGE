from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    # Authentication
    jwt_secret: str = "iteam_soc_super_secret_key_2026"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60  # 1 hour (access token)
    refresh_token_expire_days: int = 7     # 7 days (refresh token)

    # Database
    mongo_uri: str = "mongodb://admin:iteam_secure_password@localhost:27017/"
    mongo_db_name: str = "threat_intel"

    # CORS — list specific origins; never use "*" in production
    cors_origins: List[str] = ["http://localhost:5173"]

    # Cache
    cache_ttl_hours: int = 24

    # Worker (background rescan job)
    rescan_batch_size: int = 5
    max_rescan_targets: int = 100

    # MFA
    mfa_encryption_key: str = ""            # Fernet key; auto-derived in dev if empty
    mfa_required_roles: List[str] = ["admin", "manager"]  # roles that MUST enroll MFA

    # SMTP (optional — needed for password reset emails)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    smtp_from: str = "noreply@soc.local"
    smtp_tls: bool = True

    # Frontend base URL (used to build password reset links)
    frontend_url: str = "http://localhost:5173"

    # Runtime
    environment: str = "development"
    log_level: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def validate_production(self) -> None:
        """Raise if critical secrets are at their insecure defaults in production."""
        if self.environment == "production":
            if self.jwt_secret == "iteam_soc_super_secret_key_2026":
                raise ValueError("JWT_SECRET must be changed from the default value in production.")


settings = Settings()
