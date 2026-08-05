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


_api_key_index = 0

def get_gemini_client() -> genai.Client:
    global _api_key_index
    keys = [k.strip() for k in settings.gemini_api_keys.split(",") if k.strip()]
    if not keys:
        keys = [settings.gemini_api_key]
    key = keys[_api_key_index % len(keys)]
    return genai.Client(api_key=key)

def rotate_api_key():
    global _api_key_index
    _api_key_index += 1
    logger.info("Rotated to next Gemini API key in key pool.")


# ---------------------------------------------------------------------------
# Retry Logic — Handles 503 AND 429
# ---------------------------------------------------------------------------

def _call_with_retry_sync(fn, retries: int = 4, base_delay: float = 2.0):
    fallback_models = ["gemini-2.0-flash-lite", "gemini-1.5-flash", "gemini-2.0-flash"]
    last_error = None
    for attempt in range(retries + 1):
        try:
            return fn()
        except (ServerError, ClientError) as e:
            last_error = e
            status_code = getattr(e, 'code', None) or getattr(e, 'status_code', None)

            is_retryable = (
                isinstance(e, ServerError) or
                (isinstance(e, ClientError) and status_code == 429) or
                "quota" in str(e).lower()
            )

            if is_retryable and attempt < 1:
                rotate_api_key()
                retry_delay = 1.0
                logger.warning(
                    f"Sync API error {status_code}, rotated key, retrying in {retry_delay:.1f}s (attempt {attempt + 1})")
                time.sleep(retry_delay)
                continue

            from fastapi import HTTPException
            if status_code == 429 or "quota" in str(e).lower():
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
                        yield {"type": "trace", "step": f"AI capacity busy. Retrying ({rate_limit_attempts}/{MAX_429_RETRIES})…"}
                        await asyncio.sleep(2.5 * rate_limit_attempts)
                        try:
                            response_stream = await _get_stream(sdk_contents, tools, system_instruction)
                            stream_iterator = iter(response_stream)
                            continue
                        except Exception:
                            pass
                    yield {
                        "type": "error",
                        "message": "AI quota is temporarily busy. Please wait a few seconds and try again.",
                        "code": "RATE_LIMIT",
                    }
                    return
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
    return await asyncio.to_thread(web_search, query, num_results)
