"""
Cognera — Gemini Client (Production-Patched v2.2)
==================================================
Complete rewrite with all functions properly defined.
No missing functions. No regex replacements.
"""

import asyncio
import time
import logging
from functools import lru_cache
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, AsyncIterator

from google import genai
from google.genai import types
from google.genai.errors import ServerError, ClientError

from app.core.config import settings

logger = logging.getLogger(__name__)

_STREAM_EXECUTOR = ThreadPoolExecutor(
    max_workers=8, thread_name_prefix="gemini_stream_")

# Simple TTL cache using dict + timestamps (no external deps)
_orchestrator_cache = {}
_ORCHESTRATOR_CACHE_TTL = 60  # seconds


def _get_cached_orchestrator(key: str):
    """Get cached orchestrator decision if not expired."""
    if key in _orchestrator_cache:
        result, timestamp = _orchestrator_cache[key]
        if time.time() - timestamp < _ORCHESTRATOR_CACHE_TTL:
            return result
        del _orchestrator_cache[key]
    return None


def _set_cached_orchestrator(key: str, result):
    """Cache orchestrator decision with timestamp."""
    _orchestrator_cache[key] = (result, time.time())
@dataclass
class ToolCallResult:
    text: str | None
    function_calls: list[Any] | None
    model_content: Any | None = None


from app.services.key_rotator import get_gemini_key

def get_gemini_client() -> genai.Client:
    key = get_gemini_key()
    if not key:
        key = settings.gemini_api_key
    return genai.Client(api_key=key)

def rotate_api_key():
    # Calling get_gemini_key() automatically advances to the next key in the pool
    _ = get_gemini_key()
    logger.info("Rotated to next Gemini API key in key pool.")


# ---------------------------------------------------------------------------
# Retry Logic — Handles 503 AND 429
# ---------------------------------------------------------------------------

def _call_with_retry_sync(fn, retries: int = 3, base_delay: float = 1.0):
    last_error = None
    for attempt in range(retries + 1):
        try:
            return fn()
        except (ServerError, ClientError) as e:
            last_error = e
            status_code = getattr(e, 'code', None) or getattr(e, 'status_code', None)
            is_rate_limit = status_code == 429 or "quota" in str(e).lower()
            is_server_error = isinstance(e, ServerError) or status_code == 503
            if (is_rate_limit or is_server_error) and attempt < retries:
                rotate_api_key()
                time.sleep(base_delay)
                continue
            # Raise a plain exception — let the caller (multi_model_client) decide what to do
            raise RuntimeError(f"Gemini API error {status_code}: {e}") from e
        except Exception as e:
            raise RuntimeError(f"Gemini unexpected error: {e}") from e
    raise RuntimeError(f"Gemini all retries exhausted: {last_error}") from last_error


async def _call_with_retry_async(fn, retries: int = 3, base_delay: float = 1.0):
    last_error = None
    for attempt in range(retries + 1):
        try:
            return fn()
        except (ServerError, ClientError) as e:
            last_error = e
            status_code = getattr(e, 'code', None) or getattr(e, 'status_code', None)
            is_rate_limit = status_code == 429 or "quota" in str(e).lower()
            is_server_error = isinstance(e, ServerError) or status_code == 503
            if (is_rate_limit or is_server_error) and attempt < retries:
                rotate_api_key()
                await asyncio.sleep(base_delay)
                continue
            raise RuntimeError(f"Gemini async API error {status_code}: {e}") from e
        except Exception as e:
            raise RuntimeError(f"Gemini async unexpected error: {e}") from e
    raise RuntimeError(f"Gemini async all retries exhausted: {last_error}") from last_error




# ---------------------------------------------------------------------------
# Text Generation
# ---------------------------------------------------------------------------

def generate_text(prompt: str, model: str | None = None) -> str:
    client = get_gemini_client()

    def _call():
        return client.models.generate_content(
            model=model or settings.gemini_chat_model,
            contents=prompt
        )
    return _call_with_retry_sync(_call).text


def generate_text_with_search(prompt: str, model: str | None = None) -> str:
    client = get_gemini_client()

    def _call():
        return client.models.generate_content(
            model=model or settings.gemini_chat_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
            ),
        )
    return _call_with_retry_sync(_call).text


def generate_text_stream(prompt: str, model: str | None = None):
    client = get_gemini_client()
    for chunk in client.models.generate_content_stream(
        model=model or settings.gemini_chat_model,
        contents=prompt,
    ):
        if chunk.text:
            yield chunk.text


def generate_text_stream_with_search(prompt: str, model: str | None = None):
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


async def async_stream_text(prompt: str, model: str | None = None) -> AsyncIterator[str]:
    loop = asyncio.get_event_loop()

    def _generate():
        client = get_gemini_client()
        chunks = []
        for chunk in client.models.generate_content_stream(
            model=model or settings.gemini_chat_model,
            contents=prompt,
        ):
            if chunk.text:
                chunks.append(chunk.text)
        return chunks

    chunks = await loop.run_in_executor(_STREAM_EXECUTOR, _generate)
    for chunk in chunks:
        yield chunk


# ---------------------------------------------------------------------------
# JSON Generation
# ---------------------------------------------------------------------------

def generate_json(prompt: str, model: str | None = None) -> str:
    text = generate_text(prompt, model).strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return text.strip()


# ---------------------------------------------------------------------------
# Embeddings
# ---------------------------------------------------------------------------

EMBEDDING_DIMENSION = 768
MAX_EMBED_CHARS = 8000


def embed_text(text: str) -> list[float]:
    original_len = len(text)
    if original_len > MAX_EMBED_CHARS:
        text = text[:MAX_EMBED_CHARS]
        logger.warning(
            f"embed_text: Truncated input from {original_len} to {MAX_EMBED_CHARS} chars")

    client = get_gemini_client()

    def _call():
        return client.models.embed_content(
            model=settings.gemini_embedding_model,
            contents=text,
            config=types.EmbedContentConfig(
                output_dimensionality=EMBEDDING_DIMENSION),
        )
    result = _call_with_retry_sync(_call)
    return result.embeddings[0].values


async def embed_text_async(text: str) -> list[float]:
    return await asyncio.to_thread(embed_text, text)


# ---------------------------------------------------------------------------
# Image OCR via Gemini Vision
# ---------------------------------------------------------------------------

def extract_image_text(image_bytes: bytes, mime_type: str) -> str:
    """Extract text from an image (photo of notes, screenshot, etc.) using Gemini Vision.

    Supports: PNG, JPEG, WebP, GIF, BMP, TIFF.
    No additional dependencies required — uses the existing Gemini API.
    """
    client = get_gemini_client()

    def _call():
        return client.models.generate_content(
            model=settings.gemini_chat_model,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                types.Part.from_text(text=(
                    "You are an expert OCR system. Extract ALL text visible in this image "
                    "accurately and completely. Include:\n"
                    "- Printed text\n"
                    "- Handwritten text (even if slightly messy)\n"
                    "- Diagram labels and annotations\n"
                    "- Table content (preserve structure with pipes | and newlines)\n"
                    "- Mathematical formulas (use plain text notation)\n"
                    "- Headers, footers, and page numbers\n\n"
                    "Preserve the original structure, formatting, headings, and paragraph "
                    "breaks as closely as possible. Return ONLY the extracted text with "
                    "no commentary, preamble, or explanation."
                )),
            ],
        )

    result = _call_with_retry_sync(_call)
    return result.text or ""


def to_pgvector_literal(embedding: list[float]) -> str:
    return "[" + ",".join(str(x) for x in embedding) + "]"


# ---------------------------------------------------------------------------
# Message Translation (internal → google-genai SDK format)
# ---------------------------------------------------------------------------

def _messages_to_contents(messages: list[Any]) -> tuple[list[types.Content], str | None]:
    contents = []
    system_instruction = None
    for msg in messages:
        if isinstance(msg, types.Content):
            contents.append(msg)
            continue
        role_raw = msg.get("role") if isinstance(msg, dict) else None
        if role_raw == "system":
            system_instruction = msg.get("content", "")
            continue
        role = "user" if role_raw in ["user", "function"] else "model"
        parts = []

        if isinstance(msg, dict) and "function_calls" in msg:
            for call in msg["function_calls"]:
                parts.append(types.Part.from_function_call(
                    name=call.name, args=call.args))
        elif isinstance(msg, dict) and "function_responses" in msg:
            for resp in msg["function_responses"]:
                parts.append(types.Part.from_function_response(
                    name=resp["name"], response=resp["response"]))
        else:
            content_text = msg.get("content", "") if isinstance(msg, dict) else str(msg)
            if content_text:
                parts.append(types.Part.from_text(text=content_text))

        if parts:
            contents.append(types.Content(role=role, parts=parts))
    return contents, system_instruction


# ---------------------------------------------------------------------------
# Tool-Calling — Non-Streaming
# ---------------------------------------------------------------------------

def generate_with_tools(messages: list[Any], tools: list[dict]) -> ToolCallResult:
    client = get_gemini_client()
    contents, system_instruction = _messages_to_contents(messages)

    def _call():
        return client.models.generate_content(
            model=settings.gemini_chat_model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                tools=tools
            ) if (tools or system_instruction) else None
        )

    response = _call_with_retry_sync(_call)

    function_calls = []
    model_content = None
    if response.candidates:
        for candidate in response.candidates:
            if candidate.content and candidate.content.parts:
                for part in candidate.content.parts:
                    if part.function_call:
                        function_calls.append(part.function_call)
                        model_content = candidate.content

    return ToolCallResult(
        text=response.text or "",
        function_calls=function_calls if function_calls else None,
        model_content=model_content,
    )


async def generate_with_tools_async(messages: list[Any], tools: list[dict]) -> ToolCallResult:
    return await asyncio.to_thread(generate_with_tools, messages, tools)


# ---------------------------------------------------------------------------
# Tool-Calling — Streaming
# ---------------------------------------------------------------------------

MAX_TOOL_TURNS = 5


async def generate_stream(messages, tools=None, execute_tool=None):
    client = get_gemini_client()
    loop = asyncio.get_event_loop()

    yield {"type": "trace", "step": "Connecting to AI model..."}

    async def _get_stream(contents, tools_config, system_instruction=None):
        fallback_models = ["gemini-2.0-flash-lite", "gemini-1.5-flash", "gemini-2.0-flash"]
        last_error = None

        for model_name in fallback_models:
            for attempt in range(2):
                try:
                    active_client = get_gemini_client()
                    def _create_stream(target_model=model_name, c=active_client):
                        return c.models.generate_content_stream(
                            model=target_model,
                            contents=contents,
                            config=types.GenerateContentConfig(
                                system_instruction=system_instruction,
                                tools=tools_config
                            ) if (tools_config or system_instruction) else None
                        )
                    return await loop.run_in_executor(_STREAM_EXECUTOR, _create_stream)
                except (ServerError, ClientError) as e:
                    last_error = e
                    status_code = getattr(e, 'code', None) or getattr(e, 'status_code', None)
                    if status_code == 429 or "quota" in str(e).lower():
                        logger.warning(f"Model {model_name} rate limited ({status_code}), rotating API key and failing over…")
                        rotate_api_key()
                        await asyncio.sleep(0.5)
                        break  # Switch to next fallback model immediately!
                    if isinstance(e, ServerError) and attempt < 1:
                        await asyncio.sleep(1.0)
                        continue
                    raise last_error
        raise last_error

    sdk_contents, system_instruction = _messages_to_contents(messages)
    response_stream = await _get_stream(sdk_contents, tools, system_instruction)

    def _get_next_chunk(stream_iterator):
        try:
            return next(stream_iterator), False
        except StopIteration:
            return None, True

    rate_limit_attempts = 0
    MAX_429_RETRIES = 3
    _accumulated_text = ""  # Track full output for repetition detection

    def _is_repetition_loop(text: str) -> bool:
        """Detect if the model is stuck in a repetition loop."""
        if len(text) < 100:
            return False
        # Check last 200 chars for repeated phrases
        tail = text[-300:]
        # Find any phrase of 20+ chars repeated 3+ times
        for phrase_len in range(20, 60):
            if len(tail) < phrase_len * 3:
                continue
            last_phrase = tail[-phrase_len:]
            if tail.count(last_phrase) >= 3:
                return True
        return False

    for turn in range(MAX_TOOL_TURNS):
        tool_calls = []
        all_model_parts = []
        stream_iterator = iter(response_stream)

        # Non-blocking stream iteration yielding chunks immediately
        while True:
            try:
                chunk, is_done = await loop.run_in_executor(_STREAM_EXECUTOR, _get_next_chunk, stream_iterator)
            except (ServerError, ClientError) as e:
                status_code = getattr(e, 'code', None) or getattr(e, 'status_code', None)
                if status_code == 429 or "quota" in str(e).lower():
                    rate_limit_attempts += 1
                    if rate_limit_attempts <= MAX_429_RETRIES:
                        yield {"type": "trace", "step": f"AI capacity busy. Retrying ({rate_limit_attempts}/{MAX_429_RETRIES})..."}
                        await asyncio.sleep(2.5 * rate_limit_attempts)
                        try:
                            response_stream = await _get_stream(sdk_contents, tools, system_instruction)
                            stream_iterator = iter(response_stream)
                            continue
                        except Exception:
                            pass
                    raise RuntimeError("Gemini AI quota temporarily exhausted")
                raise

            if is_done:
                break

            if not chunk or not chunk.candidates:
                continue

            for candidate in chunk.candidates:
                if not candidate.content or not candidate.content.parts:
                    continue
                for part in candidate.content.parts:
                    all_model_parts.append(part)
                    if part.text:
                        _accumulated_text += part.text
                        # Detect and break repetition loops
                        if _is_repetition_loop(_accumulated_text):
                            logger.warning("Repetition loop detected in Gemini output, truncating.")
                            yield {"type": "text", "content": "\n\n*(Response truncated — the AI entered a repetition loop.)*"}
                            return
                        yield {"type": "text", "content": part.text}
                    if part.function_call:
                        tool_calls.append(part.function_call)
                        step_msg = (
                            "Searching documents..." if part.function_call.name == "tool_search_documents"
                            else "Searching web..." if part.function_call.name == "tool_search_web"
                            else f"Executing: {part.function_call.name}"
                        )
                        yield {"type": "trace", "step": step_msg}

        if not tool_calls:
            break

        # 1. Append exact combined model response turn containing ALL parts (including thought_signature & function_call)
        sdk_contents.append(types.Content(role="model", parts=all_model_parts))

        # 2. Execute local tools with intermediate trace yielding
        func_parts = []
        for tool_call in tool_calls:
            if not execute_tool:
                raise RuntimeError(
                    "Tool call requested but no execute_tool provided.")

            step_msg = (
                "Searching documents..." if tool_call.name == "tool_search_documents"
                else "Searching web..." if tool_call.name == "tool_search_web"
                else f"Executing: {tool_call.name}"
            )
            yield {"type": "trace", "step": step_msg}

            result = await execute_tool(tool_call)
            func_parts.append(
                types.Part.from_function_response(
                    name=tool_call.name, response=result
                )
            )

        # 3. Append function_response part immediately afterward as a user turn
        sdk_contents.append(types.Content(role="user", parts=func_parts))

        response_stream = await _get_stream(sdk_contents, tools, system_instruction)
    else:
        yield {"type": "text", "content": "I reached the maximum processing depth for this query. Please try rephrasing your question."}


# ---------------------------------------------------------------------------
# Web Search
# ---------------------------------------------------------------------------

def web_search(query: str, num_results: int = 5) -> list[dict]:
    from app.services.web_search_helper import perform_free_web_search
    results = []

    try:
        client = get_gemini_client()
        def _call():
            return client.models.generate_content(
                model=settings.gemini_chat_model,
                contents=f"Search the web for: {query}",
                config=types.GenerateContentConfig(
                    tools=[types.Tool(google_search=types.GoogleSearch())],
                ),
            )

        response = _call_with_retry_sync(_call)
        if response and response.candidates and response.candidates[0].grounding_metadata:
            metadata = response.candidates[0].grounding_metadata
            for chunk in getattr(metadata, "grounding_chunks", []):
                web = getattr(chunk, "web", None)
                if web:
                    results.append({
                        "title": getattr(web, "title", "") or "Untitled",
                        "uri": getattr(web, "uri", "") or "",
                        "snippet": getattr(web, "snippet", "") or "",
                    })
    except Exception as err:
        logger.warning(f"Gemini web_search exception caught gracefully: {err}")

    if not results:
        results = perform_free_web_search(query, num_results)

    return results[:num_results]


async def web_search_async(query: str, num_results: int = 5) -> list[dict]:
"""
Cognera — Gemini Client (Production-Patched v2.3)
==================================================
Fixes:
- True async streaming (no more buffering all chunks before yielding)
- Batch embeddings for document upload (1 API call instead of N)
- Async web_search to avoid blocking threads on retry sleeps
- Model upgraded to gemini-2.5-flash (better quality, still free)
"""

import asyncio
import time
import logging
from functools import lru_cache
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, AsyncIterator

from google import genai
from google.genai import types
from google.genai.errors import ServerError, ClientError

from app.core.config import settings

logger = logging.getLogger(__name__)

_STREAM_EXECUTOR = ThreadPoolExecutor(
    max_workers=8, thread_name_prefix="gemini_stream_")

# Simple TTL cache using dict + timestamps (no external deps)
_orchestrator_cache = {}
_ORCHESTRATOR_CACHE_TTL = 60  # seconds


def _get_cached_orchestrator(key: str):
    """Get cached orchestrator decision if not expired."""
    if key in _orchestrator_cache:
        result, timestamp = _orchestrator_cache[key]
        if time.time() - timestamp < _ORCHESTRATOR_CACHE_TTL:
            return result
        del _orchestrator_cache[key]
    return None


def _set_cached_orchestrator(key: str, result):
    """Cache orchestrator decision with timestamp."""
    _orchestrator_cache[key] = (result, time.time())


@dataclass
class ToolCallResult:
    text: str | None
    function_calls: list[Any] | None


@lru_cache
def get_gemini_client() -> genai.Client:
    return genai.Client(api_key=settings.gemini_api_key)


# ---------------------------------------------------------------------------
# Retry Logic — Handles 503 AND 429
# ---------------------------------------------------------------------------

def _call_with_retry_sync(fn, retries: int = 4, base_delay: float = 2.0):
    last_error = None
    for attempt in range(retries + 1):
        try:
            return fn()
        except (ServerError, ClientError) as e:
            last_error = e
            status_code = getattr(e, 'code', None) or getattr(
                e, 'status_code', None)

            is_retryable = (
                isinstance(e, ServerError) or
                (isinstance(e, ClientError) and status_code == 429)
            )

            if is_retryable and attempt < retries:
                retry_delay = base_delay * (attempt + 1)
                try:
                    if hasattr(e, 'details') and e.details:
                        for detail in e.details:
                            if hasattr(detail, 'retry_delay'):
                                retry_delay = detail.retry_delay.seconds + detail.retry_delay.nanos / 1e9
                                break
                except Exception:
                    pass

                logger.warning(
                    f"API error {status_code}, retrying in {retry_delay:.1f}s (attempt {attempt + 1}/{retries})")
                time.sleep(retry_delay)
                continue

            from fastapi import HTTPException
            if status_code == 429:
                raise HTTPException(
                    status_code=429,
                    detail="AI service is temporarily overloaded. Please wait a moment and try again."
                )
            elif status_code == 503 or isinstance(e, ServerError):
                raise HTTPException(
                    status_code=503,
                    detail="AI model is experiencing high demand. Please try again shortly."
                )
            else:
                raise HTTPException(
                    status_code=502,
                    detail=f"AI service error: {str(e)}"
                )
    raise last_error


async def _call_with_retry_async(fn, retries: int = 4, base_delay: float = 2.0):
    last_error = None
    for attempt in range(retries + 1):
        try:
            return fn()
        except (ServerError, ClientError) as e:
            last_error = e
            status_code = getattr(e, 'code', None) or getattr(
                e, 'status_code', None)

            is_retryable = (
                isinstance(e, ServerError) or
                (isinstance(e, ClientError) and status_code == 429)
            )

            if is_retryable and attempt < retries:
                retry_delay = base_delay * (attempt + 1)
                try:
                    if hasattr(e, 'details') and e.details:
                        for detail in e.details:
                            if hasattr(detail, 'retry_delay'):
                                retry_delay = detail.retry_delay.seconds + detail.retry_delay.nanos / 1e9
                                break
                except Exception:
                    pass

                logger.warning(
                    f"API error {status_code}, retrying in {retry_delay:.1f}s (attempt {attempt + 1}/{retries})")
                await asyncio.sleep(retry_delay)
                continue

            from fastapi import HTTPException
            if status_code == 429:
                raise HTTPException(
                    status_code=429,
                    detail="AI service is temporarily overloaded. Please wait a moment and try again."
                )
            elif status_code == 503 or isinstance(e, ServerError):
                raise HTTPException(
                    status_code=503,
                    detail="AI service is experiencing high demand. Please try again shortly."
                )
            else:
                raise HTTPException(
                    status_code=502,
                    detail=f"AI service error: {str(e)}"
                )
    raise last_error


# ---------------------------------------------------------------------------
# Text Generation
# ---------------------------------------------------------------------------

def generate_text(prompt: str, model: str | None = None) -> str:
    client = get_gemini_client()

    def _call():
        return client.models.generate_content(
            model=model or settings.gemini_chat_model,
            contents=prompt
        )
    return _call_with_retry_sync(_call).text


def generate_text_with_search(prompt: str, model: str | None = None) -> str:
    client = get_gemini_client()

    def _call():
        return client.models.generate_content(
            model=model or settings.gemini_chat_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
            ),
        )
    return _call_with_retry_sync(_call).text


def generate_text_stream(prompt: str, model: str | None = None):
    client = get_gemini_client()
    for chunk in client.models.generate_content_stream(
        model=model or settings.gemini_chat_model,
        contents=prompt,
    ):
        if chunk.text:
            yield chunk.text


def generate_text_stream_with_search(prompt: str, model: str | None = None):
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


async def async_stream_text(prompt: str, model: str | None = None) -> AsyncIterator[str]:
    """True async streaming — yields chunks as they arrive, no buffering."""
    queue: asyncio.Queue[str | None] = asyncio.Queue()
    loop = asyncio.get_event_loop()

    def _generate():
        try:
            client = get_gemini_client()
            for chunk in client.models.generate_content_stream(
                model=model or settings.gemini_chat_model,
                contents=prompt,
            ):
                if chunk.text:
                    queue.put_nowait(chunk.text)
            queue.put_nowait(None)  # sentinel
        except Exception as e:
            queue.put_nowait(None)
            raise e

    # Run generator in background thread, feeding the async queue
    asyncio.ensure_future(loop.run_in_executor(_STREAM_EXECUTOR, _generate))

    while True:
        chunk = await queue.get()
        if chunk is None:
            break
        yield chunk


# ---------------------------------------------------------------------------
# JSON Generation
# ---------------------------------------------------------------------------

def generate_json(prompt: str, model: str | None = None) -> str:
    text = generate_text(prompt, model).strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return text.strip()


# ---------------------------------------------------------------------------
# Embeddings — Single + Batch
# ---------------------------------------------------------------------------

EMBEDDING_DIMENSION = 768
MAX_EMBED_CHARS = 8000


def embed_text(text: str) -> list[float]:
    original_len = len(text)
    if original_len > MAX_EMBED_CHARS:
        text = text[:MAX_EMBED_CHARS]
        logger.warning(
            f"embed_text: Truncated input from {original_len} to {MAX_EMBED_CHARS} chars")

    client = get_gemini_client()

    def _call():
        return client.models.embed_content(
            model=settings.gemini_embedding_model,
            contents=text,
            config=types.EmbedContentConfig(
                output_dimensionality=EMBEDDING_DIMENSION),
        )
    result = _call_with_retry_sync(_call)
    return result.embeddings[0].values


async def embed_text_async(text: str) -> list[float]:
    return await asyncio.to_thread(embed_text, text)


def embed_text_batch(texts: list[str]) -> list[list[float]]:
    """Embed multiple texts in a single API call — much faster for document upload."""
    if not texts:
        return []

    trimmed = []
    for t in texts:
        if len(t) > MAX_EMBED_CHARS:
            trimmed.append(t[:MAX_EMBED_CHARS])
            logger.warning(
                f"embed_text_batch: Truncated one input from {len(t)} to {MAX_EMBED_CHARS} chars")
        else:
            trimmed.append(t)

    client = get_gemini_client()

    def _call():
        return client.models.embed_content(
            model=settings.gemini_embedding_model,
            contents=trimmed,
            config=types.EmbedContentConfig(
                output_dimensionality=EMBEDDING_DIMENSION),
        )

    result = _call_with_retry_sync(_call)
    # result.embeddings is a list, one per input text
    return [emb.values for emb in result.embeddings]


async def embed_text_batch_async(texts: list[str]) -> list[list[float]]:
    return await asyncio.to_thread(embed_text_batch, texts)


def to_pgvector_literal(embedding: list[float]) -> str:
    return "[" + ",".join(str(x) for x in embedding) + "]"


# ---------------------------------------------------------------------------
# Message Translation (internal → google-genai SDK format)
# ---------------------------------------------------------------------------

def _messages_to_contents(messages: list[dict]) -> list[types.Content]:
    contents = []
    for msg in messages:
        role = "user" if msg["role"] in ["user", "function"] else "model"
        parts = []

        if "function_calls" in msg:
            for call in msg["function_calls"]:
                parts.append(types.Part.from_function_call(
                    name=call.name, args=call.args))
        elif "function_responses" in msg:
            for resp in msg["function_responses"]:
                parts.append(types.Part.from_function_response(
                    name=resp["name"], response=resp["response"]))
        else:
            parts.append(types.Part.from_text(text=msg.get("content", "")))

        contents.append(types.Content(role=role, parts=parts))
    return contents


# ---------------------------------------------------------------------------
# Tool-Calling — Non-Streaming
# ---------------------------------------------------------------------------

def generate_with_tools(messages: list[dict], tools: list[dict]) -> ToolCallResult:
    client = get_gemini_client()
    contents = _messages_to_contents(messages)

    def _call():
        return client.models.generate_content(
            model=settings.gemini_chat_model,
            contents=contents,
            config=types.GenerateContentConfig(tools=tools)
        )

    response = _call_with_retry_sync(_call)

    function_calls = []
    if response.candidates:
        for candidate in response.candidates:
            if candidate.content and candidate.content.parts:
                for part in candidate.content.parts:
                    if part.function_call:
                        function_calls.append(part.function_call)

    return ToolCallResult(
        text=response.text or "",
        function_calls=function_calls if function_calls else None
    )


async def generate_with_tools_async(messages: list[dict], tools: list[dict]) -> ToolCallResult:
    return await asyncio.to_thread(generate_with_tools, messages, tools)


# ---------------------------------------------------------------------------
# Tool-Calling — Streaming (TRUE async, yields as chunks arrive)
# ---------------------------------------------------------------------------

MAX_TOOL_TURNS = 5


async def generate_stream(messages, tools=None, execute_tool=None):
    """True async streaming — yields text chunks as they arrive from Gemini,
    without buffering the entire response first."""
    client = get_gemini_client()
    loop = asyncio.get_event_loop()

    async def _get_stream(contents, tools_config):
        last_error = None
        for attempt in range(4):
            try:
                def _create_stream():
                    return client.models.generate_content_stream(
                        model=settings.gemini_chat_model,
                        contents=contents,
                        config=types.GenerateContentConfig(
                            tools=tools_config
                        ) if tools_config else None
                    )
                return await loop.run_in_executor(_STREAM_EXECUTOR, _create_stream)
            except (ServerError, ClientError) as e:
                last_error = e
                status_code = getattr(e, 'code', None) or getattr(
                    e, 'status_code', None)
                if (isinstance(e, ServerError) or status_code == 429) and attempt < 3:
                    retry_delay = 2.0 * (attempt + 1)
                    try:
                        if hasattr(e, 'details') and e.details:
                            for detail in e.details:
                                if hasattr(detail, 'retry_delay'):
                                    retry_delay = detail.retry_delay.seconds + detail.retry_delay.nanos / 1e9
                                    break
                    except Exception:
                        pass
                    logger.warning(
                        f"Stream creation error {status_code}, retrying in {retry_delay:.1f}s")
                    await asyncio.sleep(retry_delay)
                    continue
                raise last_error
        raise last_error

    sdk_contents = _messages_to_contents(messages)
    response_stream = await _get_stream(sdk_contents, tools)

    for turn in range(MAX_TOOL_TURNS):
        tool_calls = []

        # Consume stream chunk-by-chunk via a thread-safe queue
        queue: asyncio.Queue = asyncio.Queue()
        done_event = asyncio.Event()

        def _consume_to_queue():
            try:
                for chunk in response_stream:
                    queue.put_nowait(chunk)
                queue.put_nowait(None)  # sentinel
            except Exception as e:
                queue.put_nowait(e)

        # Start consumer in background
        consumer_task = asyncio.ensure_future(
            loop.run_in_executor(_STREAM_EXECUTOR, _consume_to_queue))

        while True:
            item = await queue.get()
            if item is None:
                break
            if isinstance(item, Exception):
                raise item

            chunk = item
            if not chunk.candidates:
                continue
            for candidate in chunk.candidates:
                if not candidate.content or not candidate.content.parts:
                    continue
                for part in candidate.content.parts:
                    if part.text:
                        yield {"type": "text", "content": part.text}
                    if part.function_call:
                        tool_calls.append(part.function_call)
                        yield {"type": "trace", "step": f"Executing: {part.function_call.name}"}

        await consumer_task  # ensure thread finishes cleanly

        if not tool_calls:
            break

        function_responses = []
        for tool_call in tool_calls:
            if not execute_tool:
                raise RuntimeError(
                    "Tool call requested but no execute_tool provided.")
            result = await execute_tool(tool_call)
            function_responses.append(
                {"name": tool_call.name, "response": result}
            )

        messages.append({"role": "model", "function_calls": tool_calls})
        messages.append({
            "role": "function",
            "function_responses": function_responses
        })

        sdk_contents = _messages_to_contents(messages)
        response_stream = await _get_stream(sdk_contents, tools)
    else:
        yield {"type": "error", "message": "Too many tool call turns. Please simplify your query."}


# ---------------------------------------------------------------------------
# Web Search
# ---------------------------------------------------------------------------

def web_search(query: str, num_results: int = 5) -> list[dict]:
    client = get_gemini_client()

    def _call():
        return client.models.generate_content(
            model=settings.gemini_chat_model,
            contents=f"Search the web for: {query}",
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
            ),
        )

    response = _call_with_retry_sync(_call)
    results = []

    if response.candidates and response.candidates[0].grounding_metadata:
        metadata = response.candidates[0].grounding_metadata
        for chunk in getattr(metadata, "grounding_chunks", []):
            web = getattr(chunk, "web", None)
            if web:
                results.append({
                    "title": getattr(web, "title", "") or "Untitled",
                    "uri": getattr(web, "uri", "") or "",
                    "snippet": getattr(web, "snippet", "") or "",
                })

    return results[:num_results]


async def web_search_async(query: str, num_results: int = 5) -> list[dict]:
    """Fully async web search — uses async retry so thread isn't blocked on sleep."""
    client = get_gemini_client()

    def _call():
        return client.models.generate_content(
            model=settings.gemini_chat_model,
            contents=f"Search the web for: {query}",
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
            ),
        )

    response = await _call_with_retry_async(_call)
    results = []

    if response.candidates and response.candidates[0].grounding_metadata:
        metadata = response.candidates[0].grounding_metadata
        for chunk in getattr(metadata, "grounding_chunks", []):
            web = getattr(chunk, "web", None)
            if web:
                results.append({
                    "title": getattr(web, "title", "") or "Untitled",
                    "uri": getattr(web, "uri", "") or "",
                    "snippet": getattr(web, "snippet", "") or "",
                })

    return results[:num_results]
