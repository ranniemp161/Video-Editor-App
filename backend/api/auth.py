# Authentication endpoints and JWT verification
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel
from core.limiter import limiter
from core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["auth"])

ALGORITHM = "HS256"
TOKEN_EXPIRY_HOURS = 24


class LoginRequest(BaseModel):
    """Login request with password."""
    password: str


class TokenResponse(BaseModel):
    """Login response with JWT token."""
    token: str
    expires_in: int  # seconds


def create_jwt_token(expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT token."""
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(hours=TOKEN_EXPIRY_HOURS))
    payload = {
        "sub": "app_user",
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def verify_jwt_token(authorization: str = Header(None)) -> None:
    """Dependency to verify JWT token on protected routes.

    Expects header: Authorization: Bearer <token>
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid Authorization header format")

    token = parts[1]
    try:
        jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, login_data: LoginRequest) -> TokenResponse:
    """Authenticate with app password and receive a JWT token."""
    if login_data.password != settings.app_password:
        logger.warning("Failed login attempt")
        raise HTTPException(status_code=401, detail="Invalid password")

    token = create_jwt_token()
    logger.info("Successful login — token issued")
    return TokenResponse(
        token=token,
        expires_in=TOKEN_EXPIRY_HOURS * 3600,
    )
