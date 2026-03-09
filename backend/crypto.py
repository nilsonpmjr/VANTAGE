"""
AES-256 (Fernet) encryption helpers for MFA secret storage.

Production: set MFA_ENCRYPTION_KEY env var to a Fernet key (generated with
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")

Development: a deterministic key derived from a fixed string is used automatically
    when MFA_ENCRYPTION_KEY is not set. This is NOT secure for production.
"""

import base64
import hashlib
import logging

from cryptography.fernet import Fernet
from config import settings

logger = logging.getLogger(__name__)


def _get_fernet() -> Fernet:
    key = settings.mfa_encryption_key.strip()
    if key:
        return Fernet(key.encode())

    if settings.environment == "production":
        raise RuntimeError(
            "MFA_ENCRYPTION_KEY must be set in production. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )

    logger.warning(
        "MFA_ENCRYPTION_KEY is not set — using insecure deterministic dev key. "
        "Never use this configuration in production."
    )
    raw = hashlib.sha256(b"threat-intel-mfa-dev-key-do-not-use-in-prod").digest()
    return Fernet(base64.urlsafe_b64encode(raw))


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a TOTP secret for storage."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    """Decrypt a stored TOTP secret."""
    return _get_fernet().decrypt(ciphertext.encode()).decode()
