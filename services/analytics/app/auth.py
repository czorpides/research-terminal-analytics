"""Shared-secret bearer auth. Uses hmac.compare_digest for timing safety."""
import hmac

from fastapi import Header, HTTPException, status

from .config import get_settings


def require_service_token(authorization: str | None = Header(default=None)) -> None:
    settings = get_settings()
    expected = settings.analytics_service_token
    if not expected:
        # Fail closed: without a configured secret, no authenticated route is reachable.
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="service token not configured")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing bearer token")
    presented = authorization.split(" ", 1)[1].strip()
    if not hmac.compare_digest(presented.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid bearer token")