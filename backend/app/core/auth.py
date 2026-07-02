"""
Auth dependency for protected routes — verifies the Supabase access token
from the Authorization header with connection-error resilience.
"""
from dataclasses import dataclass
import httpx
import time

from fastapi import Header, HTTPException
from app.db.supabase_client import get_supabase


@dataclass
class CurrentUser:
    id: str
    email: str | None


def get_current_user(authorization: str = Header(default="")) -> CurrentUser:
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401, detail="Missing or malformed Authorization header"
        )

    token = authorization.removeprefix("Bearer ").strip()

    last_exc = None
    for attempt in range(2):
        try:
            result = get_supabase().auth.get_user(token)
            break
        except (httpx.ReadError, httpx.ConnectError, httpx.RemoteProtocolError) as e:
            last_exc = e
            if attempt == 0:
                time.sleep(0.5)
            continue
    else:
        raise HTTPException(status_code=503, detail=f"Auth service temporarily unavailable: {last_exc}")

    if not result or not result.user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return CurrentUser(id=result.user.id, email=result.user.email)
