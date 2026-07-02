"""
Supabase client for the backend.

On Windows, Supabase's server occasionally closes idle HTTP/2 connections
(WinError 10054 — "An existing connection was forcibly closed by the remote
host"). The lru_cache pattern holds onto a single shared client that can
end up with a dead connection. We fix this two ways:

  1. No lru_cache — create a fresh client each call. Negligible overhead
     since create_client() is cheap; the heavy work is in the HTTP request.
  2. call_supabase() — a thin retry wrapper for Supabase calls that catches
     httpx.ReadError / ConnectError and retries once with a fresh client.
     Import and use it anywhere you'd normally call .execute() directly.
"""
import time
import httpx
from supabase import create_client, Client
from app.core.config import settings


def get_supabase() -> Client:
    return create_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
    )


def call_supabase(fn, retries: int = 2, delay: float = 0.5):
    """Call a Supabase operation (anything returning .execute()) with retry.

    Usage:
        result = call_supabase(lambda: get_supabase().table("documents")
                                                      .select("*")
                                                      .execute())

    Retries on httpx.ReadError and httpx.ConnectError — both of which map
    to WinError 10054 on Windows. Other exceptions (bad auth, 4xx, etc.)
    re-raise immediately since retrying won't help.
    """
    last_exc = None
    for attempt in range(retries + 1):
        try:
            return fn()
        except (httpx.ReadError, httpx.ConnectError, httpx.RemoteProtocolError) as e:
            last_exc = e
            if attempt < retries:
                time.sleep(delay * (attempt + 1))
            continue
    raise last_exc
