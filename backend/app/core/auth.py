"""
Auth dependency for protected routes.

The frontend attaches the user's Supabase access token as a Bearer token
on every request (see frontend/lib/api.ts). This dependency verifies that
token against Supabase's Auth server and returns the authenticated user.
Use it on any route that should only work for a logged-in user.
"""
from dataclasses import dataclass

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

    try:
        result = get_supabase().auth.get_user(token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token verification failed: {e}")

    if not result or not result.user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return CurrentUser(id=result.user.id, email=result.user.email)
