"""
Thin wrapper around the Gemini API so the rest of the app never talks to
google-genai directly. If we ever swap providers, this is the only file
that needs to change.
"""
from functools import lru_cache

from google import genai
from google.genai import types

from app.core.config import settings


@lru_cache
def get_gemini_client() -> genai.Client:
    return genai.Client(api_key=settings.gemini_api_key)


def generate_text(prompt: str, model: str | None = None) -> str:
    """One-shot text generation. Use this for chat replies, quiz/flashcard
    generation, and summarization — pass a fully-formed prompt in."""
    client = get_gemini_client()
    response = client.models.generate_content(
        model=model or settings.gemini_chat_model,
        contents=prompt,
    )
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
    result = client.models.embed_content(
        model=settings.gemini_embedding_model,
        contents=text,
        config=types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIMENSION),
    )
    return result.embeddings[0].values


def to_pgvector_literal(embedding: list[float]) -> str:
    """Format an embedding as the string pgvector expects over PostgREST,
    e.g. "[0.123,-0.456,...]". Sending a raw JSON array instead will fail
    to insert — Postgres needs this exact text form to cast into `vector`."""
    return "[" + ",".join(str(x) for x in embedding) + "]"
