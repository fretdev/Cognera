"""
Cognera — API Key Pool Manager with Round-Robin Rotation
========================================================
Thread-safe round-robin key pool manager for Gemini, Groq, and OpenRouter.
Enables seamless multi-key load balancing across free tier quotas.
"""

import logging
import threading
from app.core.config import settings

logger = logging.getLogger(__name__)


class KeyPool:
    def __init__(self, name: str, primary_key: str, multi_keys: str):
        self.name = name
        self._lock = threading.Lock()

        # Parse keys from comma-separated string or fallback to primary key
        parsed = [k.strip() for k in multi_keys.split(",") if k.strip()]
        if not parsed and primary_key.strip():
            parsed = [primary_key.strip()]

        self.keys = parsed
        self._index = 0

    def get_key(self) -> str | None:
        if not self.keys:
            return None
        with self._lock:
            key = self.keys[self._index % len(self.keys)]
            self._index = (self._index + 1) % len(self.keys)
            return key

    def get_all_keys(self) -> list[str]:
        return list(self.keys)

    def count(self) -> int:
        return len(self.keys)


_gemini_pool = None
_groq_pool = None
_openrouter_pool = None
_pool_lock = threading.Lock()


def get_gemini_key() -> str:
    global _gemini_pool
    if _gemini_pool is None:
        with _pool_lock:
            if _gemini_pool is None:
                _gemini_pool = KeyPool("Gemini", settings.gemini_api_key, settings.gemini_api_keys)
    return _gemini_pool.get_key() or ""


def get_groq_key() -> str:
    global _groq_pool
    if _groq_pool is None:
        with _pool_lock:
            if _groq_pool is None:
                _groq_pool = KeyPool("Groq", settings.groq_api_key, getattr(settings, "groq_api_keys", ""))
    return _groq_pool.get_key() or ""


def get_openrouter_key() -> str:
    global _openrouter_pool
    if _openrouter_pool is None:
        with _pool_lock:
            if _openrouter_pool is None:
                _openrouter_pool = KeyPool("OpenRouter", settings.openrouter_api_key, getattr(settings, "openrouter_api_keys", ""))
    return _openrouter_pool.get_key() or ""


def get_all_groq_keys() -> list[str]:
    get_groq_key()
    return _groq_pool.get_all_keys() if _groq_pool else []


def get_all_gemini_keys() -> list[str]:
    get_gemini_key()
    return _gemini_pool.get_all_keys() if _gemini_pool else []
