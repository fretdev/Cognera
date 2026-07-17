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
    """One-shot text generation with retry."""
    client = get_gemini_client()

    def _call():
        return client.models.generate_content(model=model or settings.gemini_chat_model, contents=prompt)
    return _call_with_retry(_call).text


def generate_text_with_search(prompt: str, model: str | None = None) -> str:
    """Generation with Google Search grounding for general-mode queries."""
    client = get_gemini_client()

    def _call():
        return client.models.generate_content(
            model=model or settings.gemini_chat_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
            ),
        )
    return _call_with_retry(_call).text


def generate_text_stream(prompt: str, model: str | None = None):
    """Stream text generation without web search (used for grounded/document mode)."""
    client = get_gemini_client()
    for chunk in client.models.generate_content_stream(
        model=model or settings.gemini_chat_model,
        contents=prompt,
    ):
        if chunk.text:
            yield chunk.text


def generate_text_stream_with_search(prompt: str, model: str | None = None):
    """Streaming generation with Google Search grounding."""
    client = get_gemini_client()
    for chunk in client.models.generate_content_stream(
        model=model or settings.gemini_chat_model,
        contents=prompt,
        config=types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())],
        ),
    ):
        if chunk.text:
            yield chunk.text


def stream_text(prompt: str, model: str | None = None):
    """Generator that yields text chunks as Gemini produces them.
    Used by the /chat/ask/stream SSE endpoint to give students
    the live "thinking" experience rather than waiting for the full answer."""
    client = get_gemini_client()
    last_error = None
    for attempt in range(3):
        try:
            for chunk in client.models.generate_content_stream(
                model=model or settings.gemini_chat_model,
                contents=prompt,
            ):
                if chunk.text:
                    yield chunk.text
            return
        except ServerError as e:
            last_error = e
            if attempt < 2:
                time.sleep(2 * (attempt + 1))
                continue
    raise last_error


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
            config=types.EmbedContentConfig(
                output_dimensionality=EMBEDDING_DIMENSION),
        )

    result = _call_with_retry(_call)
    return result.embeddings[0].values


def to_pgvector_literal(embedding: list[float]) -> str:
    """Format an embedding as the string pgvector expects over PostgREST,
    e.g. "[0.123,-0.456,...]". Sending a raw JSON array instead will fail
    to insert — Postgres needs this exact text form to cast into `vector`."""
    return "[" + ",".join(str(x) for x in embedding) + "]"
