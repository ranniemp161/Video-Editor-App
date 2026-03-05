import logging
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger(__name__)

def get_real_ip(request: Request) -> str:
    """
    Extract the real client IP, even behind a proxy (like Render/Cloudflare).
    """
    # Check X-Forwarded-For header
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # X-Forwarded-For: client, proxy1, proxy2...
        # We take the first one (the original client)
        client_ip = forwarded.split(",")[0].strip()
        return client_ip
    
    # Fallback to standard remote address
    return get_remote_address(request)

# Global limiter instance
limiter = Limiter(key_func=get_real_ip)
