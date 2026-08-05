"""
Cognera — Multi-Model Provider Client
======================================
Combines 4 top-tier AI models across OpenRouter (DeepSeek), Groq (Qwen/Llama),
and Google AI Studio (Gemini 2.0 Flash-Lite & 1.5 Flash).

Features zero-delay automatic failover if any provider or key hits a rate limit.
"""

import json
import logging
import asyncio
from typing import AsyncIterator, Any
import httpx

from app.core.config import settings
from app.services.gemini_client import (
    generate_stream as gemini_generate_stream,
    generate_text as gemini_generate_text,
    get_gemini_client,
    rotate_api_key,
)

logger = logging.getLogger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


async def stream_openrouter_deepseek(
    messages: list[dict],
    model: str = "deepseek/deepseek-chat",
) -> AsyncIterator[dict]:
    api_key = settings.openrouter_api_key.strip()
    if not api_key:
        raise ValueError("No OpenRouter API key configured.")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://cognera.app",
        "X-Title": "Cognera AI Study Assistant",
    }

    formatted_messages = []
    for m in messages:
        if isinstance(m, dict):
            role = m.get("role", "user")
            content = m.get("content", "")
            if role in ("system", "user", "assistant") and content:
                formatted_messages.append({"role": role, "content": content})

    payload = {
        "model": model,
        "messages": formatted_messages,
        "stream": True,
        "temperature": 0.3,
    }

    async with httpx.AsyncClient(timeout=45.0) as client:
        async with client.stream("POST", OPENROUTER_URL, headers=headers, json=payload) as response:
            if response.status_code == 429:
                raise ValueError("OpenRouter Rate Limited (429)")
            if response.status_code != 200:
                body = await response.aread()
                raise ValueError(f"OpenRouter Error {response.status_code}: {body.decode()}")

            async for line in response.aiter_lines():
                line = line.strip()
                if line.startswith("data: "):
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk_data = json.loads(data_str)
                        delta = chunk_data.get("choices", [{}])[0].get("delta", {})
                        text = delta.get("content", "")
                        if text:
                            yield {"type": "text", "content": text}
                    except Exception:
                        continue


async def stream_groq_qwen(
    messages: list[dict],
    model: str = "qwen-2.5-72b-instruct",
) -> AsyncIterator[dict]:
    api_key = settings.groq_api_key.strip()
    if not api_key:
        raise ValueError("No Groq API key configured.")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    formatted_messages = []
    for m in messages:
        if isinstance(m, dict):
            role = m.get("role", "user")
            content = m.get("content", "")
            if role in ("system", "user", "assistant") and content:
                formatted_messages.append({"role": role, "content": content})

    payload = {
        "model": model,
        "messages": formatted_messages,
        "stream": True,
        "temperature": 0.3,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        async with client.stream("POST", GROQ_URL, headers=headers, json=payload) as response:
            if response.status_code == 429:
                raise ValueError("Groq Rate Limited (429)")
            if response.status_code != 200:
                body = await response.aread()
                raise ValueError(f"Groq Error {response.status_code}: {body.decode()}")

            async for line in response.aiter_lines():
                line = line.strip()
                if line.startswith("data: "):
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk_data = json.loads(data_str)
                        delta = chunk_data.get("choices", [{}])[0].get("delta", {})
                        text = delta.get("content", "")
                        if text:
                            yield {"type": "text", "content": text}
                    except Exception:
                        continue


async def stream_multi_provider_text(
    messages: list[dict],
    tools: list[Any] = None,
    execute_tool: Any = None,
    preferred_model: str | None = "auto",
) -> AsyncIterator[dict]:
    has_openrouter = bool(settings.openrouter_api_key.strip())
    has_groq = bool(settings.groq_api_key.strip())

    # Explicit Model Direct Routing
    if preferred_model == "deepseek" and has_openrouter:
        try:
            yield {"type": "trace", "step": "Running DeepSeek V3…"}
            async for chunk in stream_openrouter_deepseek(messages, "deepseek/deepseek-chat"):
                yield chunk
            return
        except Exception as e:
            logger.warning(f"DeepSeek direct call failed ({e}), falling back to auto cascade…")

    if preferred_model == "groq" and has_groq:
        try:
            yield {"type": "trace", "step": "Running Qwen 2.5 72B (Groq 500t/s)…"}
            async for chunk in stream_groq_qwen(messages, "qwen-2.5-72b-instruct"):
                yield chunk
            return
        except Exception as e:
            logger.warning(f"Groq direct call failed ({e}), falling back to auto cascade…")

    # Auto Model Cascade Mode
    gemini_hit_429 = False
    try:
        async for chunk in gemini_generate_stream(messages, tools=tools, execute_tool=execute_tool):
            if chunk.get("type") == "error" and chunk.get("code") == "RATE_LIMIT":
                gemini_hit_429 = True
                break
            yield chunk
        if not gemini_hit_429:
            return
    except Exception as e:
        logger.warning(f"Gemini stream exception ({e}), triggering provider failover…")
        gemini_hit_429 = True

    if gemini_hit_429:
        if has_groq:
            try:
                yield {"type": "trace", "step": "Gemini busy. Switching to Groq (500t/s)…"}
                async for chunk in stream_groq_qwen(messages, "llama-3.3-70b-versatile"):
                    yield chunk
                return
            except Exception as e:
                logger.warning(f"Groq failover failed: {e}")

        if has_openrouter:
            try:
                yield {"type": "trace", "step": "Switching to DeepSeek V3…"}
                async for chunk in stream_openrouter_deepseek(messages, "deepseek/deepseek-chat"):
                    yield chunk
                return
            except Exception as e:
                logger.warning(f"DeepSeek failover failed: {e}")

        yield {
            "type": "error",
            "message": "AI quota is temporarily busy. Please wait a few seconds and try again.",
            "code": "RATE_LIMIT",
        }
