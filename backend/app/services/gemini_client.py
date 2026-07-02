"""
Thin wrapper around the Gemini API so the rest of the app never talks to
google-genai directly. If we ever swap providers, this is the only file
that needs to change.
"""
import time

from functools import lru_cache

from google import genai
from google.genai import types
from google.genai.errors import ServerError

from app.core.config import settings


@lru_cache
def get_gemini_client() -> genai.Client:
    return genai.Client(api_key=settings.gemini_api_key)


def _call_with_retry(fn, retries: int = 4, base_delay: float = 2.0):
    """Retry on transient Gemini server errors (503 UNAVAILABLE).

    Gemini free tier spikes under load — 4 attempts with exponential backoff
    (2s, 4s, 6s, 8s) gives enough time for the spike to pass without making
    the user wait more than ~20 seconds total before giving up cleanly.
    Anything other than ServerError re-raises immediately.
    """
    last_error = None
    for attempt in range(retries + 1):
        try:
            return fn()
        except ServerError as e:
            last_error = e
            if attempt < retries:
                wait = base_delay * (attempt + 1)
                time.sleep(wait)
                continue
            # All retries exhausted — raise a clean HTTPException so FastAPI
            # returns a 503 JSON response rather than a raw Python traceback.
            from fastapi import HTTPException
            raise HTTPException(
                status_code=503,
                detail="Gemini is experiencing high demand right now. Wait a moment and try again."
            )
    raise last_error  # unreachable, satisfies type checkers


def generate_text(prompt: str, model: str | None = None) -> str:
    """One-shot text generation. Use this for chat replies, quiz/flashcard
    generation, and summarization — pass a fully-formed prompt in."""
    client = get_gemini_client()

    def _call():
        return client.models.generate_content(
            model=model or settings.gemini_chat_model,
            contents=prompt,
        )

    response = _call_with_retry(_call)
    return response.text


def generate_json(prompt: str, model: str | None = None) -> str:
    """Like generate_text, but strips markdown code fences Gemini sometimes
    wraps JSON in (```json ... ```) despite being told to return raw JSON.
    Callers should json.loads() the result themselves."""
    text = generate_text(prompt, model).strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return text.strip()


# Must match the `vector(N)` dimension in backend/db/schema.sql. If you ever
# change this, update the column definition (and re-embed existing data) too.
EMBEDDING_DIMENSION = 768


def embed_text(text: str) -> list[float]:
    """Embed a single piece of text for storage/retrieval in pgvector."""
    client = get_gemini_client()

    def _call():
        return client.models.embed_content(
            model=settings.gemini_embedding_model,
            contents=text,
            config=types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIMENSION),
        )

    result = _call_with_retry(_call)
    return result.embeddings[0].values


def to_pgvector_literal(embedding: list[float]) -> str:
    """Format an embedding as the string pgvector expects over PostgREST,
    e.g. "[0.123,-0.456,...]". Sending a raw JSON array instead will fail
    to insert — Postgres needs this exact text form to cast into `vector`."""
    return "[" + ",".join(str(x) for x in embedding) + "]"
