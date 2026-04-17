"""Shared SlowAPI limiter instance for all routers."""

import jwt
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from config import settings


def _get_rate_limit_key(request: Request) -> str:
    """Extract user identity from JWT for per-user rate limiting.

    Falls back to remote IP address for unauthenticated requests.
    This avoids the corporate NAT problem where all analysts share
    a single IP and exhaust the rate limit collectively.
    """
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            payload = jwt.decode(
                token,
                settings.jwt_secret,
                algorithms=[settings.algorithm],
                options={"verify_exp": False},
            )
            username = payload.get("sub")
            if username:
                return f"user:{username}"
        except (jwt.InvalidTokenError, Exception):
            pass
    return get_remote_address(request)


limiter = Limiter(key_func=_get_rate_limit_key)
