"""
Single shared Supabase client for the backend.

Uses the service_role key, so this client bypasses Row Level Security —
that's intentional and safe here because it only ever runs on the server.
Never expose this key or import this module from anything client-facing.
"""
from functools import lru_cache

from supabase import create_client, Client

from app.core.config import settings


@lru_cache
def get_supabase() -> Client:
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
