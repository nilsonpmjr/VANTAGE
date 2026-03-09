from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    # Authentication — no default; must be set via environment variable
    jwt_secret: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60  # 1 hour (access token)
    refresh_token_expire_days: int = 7     # 7 days (refresh token)

    # Database — no default; must be set via environment variable
    mongo_uri: str
    mongo_db_name: str = "threat_intel"

    # CORS — list specific origins; never use "*" in production
    cors_origins: List[str] = ["http://localhost:5173"]

    # Cache
    cache_ttl_hours: int = 24

    # Worker (background rescan job)
    rescan_batch_size: int = 5
    max_rescan_targets: int = 100

    # Batch analysis
    batch_max_targets: int = 50
    batch_inter_target_delay_ms: int = 500  # ms between external calls
    batch_job_ttl_hours: int = 24

    # Recon Engine
    recon_cache_ttl_hours: int = 6
    recon_port_range: str = "21,22,23,25,53,80,110,111,135,139,143,443,445,993,995,1723,3306,3389,5900,8080,8443,8888"
    recon_max_concurrent: int = 2

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
        """Raise if critical secrets are insecure or missing in production."""
        if self.environment != "production":
            return
        errors = []
        if len(self.jwt_secret) < 32:
            errors.append("JWT_SECRET must be at least 32 characters.")
        if not self.mfa_encryption_key:
            errors.append("MFA_ENCRYPTION_KEY must be set in production.")
        if errors:
            raise ValueError("Insecure production configuration:\n" + "\n".join(f"  - {e}" for e in errors))


settings = Settings()
