"""Input validation helpers for VANTAGE targets."""

import re
import ipaddress
from dataclasses import dataclass


class ValidationError(Exception):
    """Raised when input validation fails."""
    pass


@dataclass
class ValidatedTarget:
    """Represents a validated and normalized target."""
    original: str
    sanitized: str
    target_type: str

    def __str__(self) -> str:
        return f"{self.sanitized} ({self.target_type})"


class InputValidator:
    """
    Validate and classify supported indicator types.
    """

    # Validation bounds
    MAX_INPUT_LENGTH = 256
    MAX_DOMAIN_LENGTH = 253  # RFC 1035

    # Precompiled patterns keep the hot path cheap.
    HASH_PATTERNS = {
        'md5': re.compile(r'^[a-fA-F0-9]{32}$'),
        'sha1': re.compile(r'^[a-fA-F0-9]{40}$'),
        'sha256': re.compile(r'^[a-fA-F0-9]{64}$'),
    }

    DOMAIN_PATTERN = re.compile(
        r'^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$'
    )

    # Allow only the character set required by supported target types.
    ALLOWED_CHARS_PATTERN = re.compile(r'^[a-fA-F0-9.:/-]+$')

    @classmethod
    def validate(cls, target: str) -> ValidatedTarget:
        """Validate a target and return its normalized representation."""
        if not target or not isinstance(target, str):
            raise ValidationError("Target must be a non-empty string")

        original = target
        target = target.strip()

        if target.startswith("-"):
            raise ValidationError("Target cannot start with '-'")

        if len(target) > cls.MAX_INPUT_LENGTH:
            raise ValidationError(
                f"Target exceeds maximum length of {cls.MAX_INPUT_LENGTH} characters"
            )

        if len(target) < 3:
            raise ValidationError("Target is too short (minimum 3 characters)")

        # Reject control characters and punctuation outside the supported set.
        if not cls.ALLOWED_CHARS_PATTERN.fullmatch(target) and not cls.DOMAIN_PATTERN.fullmatch(target):
            raise ValidationError("Target contains invalid characters")

        target_type = cls._identify_type(target)

        if target_type == 'unknown':
            raise ValidationError(
                "Could not identify target type. "
                "Supported types: IPv4/IPv6, Domain, Hash (MD5/SHA1/SHA256)"
            )

        sanitized = cls._sanitize(target, target_type)

        return ValidatedTarget(
            original=original,
            sanitized=sanitized,
            target_type=target_type
        )

    @classmethod
    def _identify_type(cls, target: str) -> str:
        """Identify the target type."""
        if cls._is_valid_ip(target):
            return 'ip'

        if cls._is_valid_hash(target):
            return 'hash'

        if cls._is_valid_domain(target):
            return 'domain'

        return 'unknown'

    @classmethod
    def _is_valid_ip(cls, target: str) -> bool:
        """Return True for valid IPv4 or IPv6 addresses."""
        try:
            ipaddress.ip_address(target)
            return True
        except ValueError:
            return False

    @classmethod
    def _is_valid_hash(cls, target: str) -> bool:
        """Return True for supported hash lengths."""
        for hash_type, pattern in cls.HASH_PATTERNS.items():
            if pattern.fullmatch(target):
                return True
        return False

    @classmethod
    def _is_valid_domain(cls, target: str) -> bool:
        """Return True for domains that fit the supported policy."""
        if len(target) > cls.MAX_DOMAIN_LENGTH:
            return False

        if not cls.DOMAIN_PATTERN.fullmatch(target):
            return False

        labels = target.split('.')

        if any(len(label) > 63 for label in labels):
            return False

        if any(label.startswith('-') or label.endswith('-') for label in labels):
            return False

        return True

    @classmethod
    def _sanitize(cls, target: str, target_type: str) -> str:
        """Normalize the target based on its detected type."""
        if target_type == 'ip':
            # Normalize IPv4/IPv6 formatting.
            return str(ipaddress.ip_address(target))

        elif target_type == 'hash':
            # Hashes are case-insensitive.
            return target.lower()

        elif target_type == 'domain':
            # Domains should be lowercase and dot-normalized.
            return target.lower().rstrip('.')

        return target


class TargetTypeIdentifier:
    """
    Identificador rápido de tipo de alvo sem validação completa.

    Use quando a performance for mais importante que a validação rigorosa.
    """

    @staticmethod
    def quick_identify(target: str) -> str:
        """
        Identificação rápida sem validação rigorosa.

        Args:
            target: String a ser identificada

        Returns:
            Tipo identificado: 'ip', 'domain', 'hash', ou 'unknown'
        """
        target = target.strip()

        # IP
        try:
            ipaddress.ip_address(target)
            return 'ip'
        except ValueError:
            pass

        # Hash (apenas verifica tamanho)
        if len(target) in (32, 40, 64) and target.isalnum():
            return 'hash'

        # Domain (check simples)
        if '.' in target and not target.replace('.', '').replace('-', '').isalnum():
            return 'unknown'

        if '.' in target:
            return 'domain'

        return 'unknown'


# Convenience wrappers
def validate_target(target: str) -> ValidatedTarget:
    """
    Função de conveniência para validar um alvo.

    Args:
        target: Alvo a ser validado

    Returns:
        ValidatedTarget

    Raises:
        ValidationError: Se o alvo for inválido
    """
    return InputValidator.validate(target)


def identify_type(target: str) -> str:
    """
    Função de conveniência para identificar o tipo de um alvo.

    Args:
        target: Alvo a ser identificado

    Returns:
        Tipo: 'ip', 'domain', 'hash', ou 'unknown'
    """
    try:
        result = InputValidator.validate(target)
        return result.target_type
    except ValidationError:
        return 'unknown'
