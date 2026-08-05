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
) -> AsyncIterator[dict]:
    """
    4-Model Unified Streaming Cascade:
    DeepSeek V3 (OpenRouter) -> Qwen 2.5 72B (Groq) -> Gemini 2.0 Flash-Lite (Google) -> Gemini 1.5 Flash (Google)
    """
    has_openrouter = bool(settings.openrouter_api_key.strip())
    has_groq = bool(settings.groq_api_key.strip())

    # Provider 1: DeepSeek V3 (via OpenRouter) if key configured and no tools required
    if has_openrouter and not tools:
        try:
            logger.info("Routing query to DeepSeek V3 via OpenRouter…")
            yield {"type": "trace", "step": "Thinking with DeepSeek V3…"}
            async for chunk in stream_openrouter_deepseek(messages, "deepseek/deepseek-chat"):
                yield chunk
            return
        except Exception as e:
            logger.warning(f"DeepSeek/OpenRouter failed ({e}), falling back to next provider…")

    # Provider 2: Qwen 2.5 72B / Llama 3.3 70B (via Groq) if key configured and no tools required
    if has_groq and not tools:
        try:
            logger.info("Routing query to Qwen 2.5 72B via Groq…")
            yield {"type": "trace", "step": "Thinking with Qwen 2.5 (Groq 500t/s)…"}
            async for chunk in stream_groq_qwen(messages, "qwen-2.5-72b-instruct"):
                yield chunk
            return
        except Exception as e:
            logger.warning(f"Groq failed ({e}), falling back to Gemini…")

    # Provider 3 & 4: Gemini 2.0 Flash-Lite & 1.5 Flash with tool support & key pool rotation
    async for chunk in gemini_generate_stream(messages, tools=tools, execute_tool=execute_tool):
        yield chunk
