"""
SSL/TLS Recon module — uses stdlib ssl + cryptography (already a project dependency).
Connects to target:443 and inspects the certificate chain.
"""

import asyncio
import socket
import ssl
from datetime import datetime, timezone
from functools import partial

from logging_config import get_logger
from .base import ReconModule

logger = get_logger("SSLModule")


class SSLModule(ReconModule):
    name = "ssl"
    display_name = "SSL/TLS"
    requires = []
    target_types = ["domain"]   # IPs usually don't have hostname-validated certs
    timeout_seconds = 10

    async def run(self, target: str, target_type: str) -> dict:
        loop = asyncio.get_event_loop()
        try:
            result = await asyncio.wait_for(
                loop.run_in_executor(None, partial(self._inspect, target)),
                timeout=self.timeout_seconds,
            )
            return result
        except asyncio.TimeoutError:
            return {"error": "SSL connection timed out"}
        except Exception as e:
            return {"error": str(e)}

    def _inspect(self, target: str) -> dict:
        try:
            from cryptography import x509
            from cryptography.hazmat.primitives import hashes
        except ImportError:
            return {"error": "cryptography package not available"}

        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_OPTIONAL

        try:
            with socket.create_connection((target, 443), timeout=8) as sock:
                with ctx.wrap_socket(sock, server_hostname=target) as ssock:
                    der = ssock.getpeercert(binary_form=True)
                    cipher = ssock.cipher()
                    protocol = ssock.version()
        except Exception as e:
            return {"error": f"Connection failed: {e}"}

        if not der:
            return {"error": "No certificate received"}

        try:
            cert = x509.load_der_x509_certificate(der)
        except Exception as e:
            return {"error": f"Certificate parse error: {e}"}

        now = datetime.now(timezone.utc)
        not_before = cert.not_valid_before_utc
        not_after = cert.not_valid_after_utc
        is_expired = now > not_after
        days_left = (not_after - now).days

        # Subject
        subject = {attr.oid.dotted_string: attr.value for attr in cert.subject}
        issuer = {attr.oid.dotted_string: attr.value for attr in cert.issuer}

        # Common names from OID
        cn_oid = x509.NameOID.COMMON_NAME
        subject_cn = next((attr.value for attr in cert.subject if attr.oid == cn_oid), None)
        issuer_cn = next((attr.value for attr in cert.issuer if attr.oid == cn_oid), None)

        is_self_signed = subject_cn == issuer_cn

        # Subject Alternative Names
        sans: list[str] = []
        try:
            san_ext = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName)
            sans = [name.value for name in san_ext.value]
        except x509.ExtensionNotFound:
            logger.debug(f"Certificate for {target} has no SAN extension")
        except Exception as exc:
            logger.debug(f"Failed to read SAN extension for {target}: {exc}")

        # Fingerprint
        try:
            fingerprint = cert.fingerprint(hashes.SHA256()).hex()
        except Exception:
            fingerprint = None

        return {
            "subject_cn": subject_cn,
            "issuer_cn": issuer_cn,
            "is_self_signed": is_self_signed,
            "is_expired": is_expired,
            "days_until_expiry": days_left,
            "not_before": not_before.isoformat(),
            "not_after": not_after.isoformat(),
            "sans": sans[:20],   # cap to 20 for display
            "serial_number": str(cert.serial_number),
            "fingerprint_sha256": fingerprint,
            "protocol": protocol,
            "cipher": cipher[0] if cipher else None,
        }
