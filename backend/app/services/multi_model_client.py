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
from app.services.key_rotator import get_groq_key, get_openrouter_key, get_all_groq_keys
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
    api_key = get_openrouter_key()
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
    all_groq_keys = get_all_groq_keys()
    if not all_groq_keys:
        raise ValueError("No Groq API key configured.")

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

    last_err = None
    for attempt_idx in range(max(1, len(all_groq_keys))):
        api_key = get_groq_key()
        if not api_key:
            continue

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream("POST", GROQ_URL, headers=headers, json=payload) as response:
                    if response.status_code == 429:
                        logger.warning(f"Groq stream key {attempt_idx + 1} hit 429, rotating to next key in pool...")
                        last_err = ValueError("Groq Rate Limited (429)")
                        continue
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
                    return
        except Exception as e:
            last_err = e
            logger.warning(f"Groq stream attempt {attempt_idx + 1} failed: {e}")

    raise last_err or ValueError("All Groq API keys rate limited.")


async def stream_multi_provider_text(
    messages: list[dict],
    tools: list[Any] = None,
    execute_tool: Any = None,
    preferred_model: str | None = "auto",
) -> AsyncIterator[dict]:
    has_openrouter = bool(get_openrouter_key())
    has_groq = bool(get_groq_key())

    # -----------------------------------------------------------------------
    # PROVIDER ORDER: Groq first (500t/s, no quota issues), DeepSeek second,
    # Gemini last (has strict 15 RPM free tier quota).
    # tools=None is always passed so providers never simulate tool calls.
    # -----------------------------------------------------------------------

    # Explicit Model Direct Routing
    if preferred_model == "deepseek" and has_openrouter:
        try:
            yield {"type": "trace", "step": "Running DeepSeek V3…"}
            async for chunk in stream_openrouter_deepseek(messages, "deepseek/deepseek-chat"):
                yield chunk
            return
        except Exception as e:
            logger.warning(f"DeepSeek direct call failed ({e}), falling back to auto cascade…")

    if preferred_model == "gemini":
        # explicit gemini routing - skip Groq-first below
        pass
    elif has_groq:
        # ALWAYS try Groq first in auto mode — it's 500t/s and has no tool-call simulation issues
        try:
            yield {"type": "trace", "step": "Thinking (Groq 500t/s)…"}
            async for chunk in stream_groq_qwen(messages, "llama-3.3-70b-versatile"):
                yield chunk
            return
        except Exception as e:
            logger.warning(f"Groq primary call failed ({e}), falling back…")

    if preferred_model == "groq" and has_groq:
        # already tried above, fall through
        pass

    # DeepSeek second
    if has_openrouter:
        try:
            yield {"type": "trace", "step": "Thinking (DeepSeek V3)…"}
            async for chunk in stream_openrouter_deepseek(messages, "deepseek/deepseek-chat"):
                yield chunk
            return
        except Exception as e:
            logger.warning(f"DeepSeek second-choice call failed ({e}), falling back to Gemini…")

    # Gemini last resort (has strict free-tier quota)
    for cascade_attempt in range(3):
        gemini_hit_429 = False
        try:
            async for chunk in gemini_generate_stream(messages, tools=None, execute_tool=None):
                if chunk.get("type") == "error" and chunk.get("code") == "RATE_LIMIT":
                    gemini_hit_429 = True
                    break
                yield chunk
            if not gemini_hit_429:
                return
        except Exception as e:
            logger.warning(f"Gemini stream exception ({e})")
            gemini_hit_429 = True

        if gemini_hit_429 and cascade_attempt < 2:
            yield {"type": "trace", "step": f"AI capacity busy. Rotating key & retrying ({cascade_attempt + 1}/2)…"}
            rotate_api_key()
            await asyncio.sleep(2.0)
            continue

    yield {
        "type": "error",
        "message": "AI is at capacity. Please wait a moment and try again.",
        "code": "RATE_LIMIT",
    }


def generate_multi_provider_json(prompt: str) -> str:
    from app.services.gemini_client import generate_json
    from fastapi import HTTPException

    all_groq_keys = get_all_groq_keys()

    # If Groq keys are present, try available Groq keys in pool FIRST for instant sub-second JSON generation!
    for attempt_idx in range(max(1, len(all_groq_keys))):
        groq_key = get_groq_key()
        if groq_key:
            try:
                import httpx
                headers = {
                    "Authorization": f"Bearer {groq_key}",
                    "Content-Type": "application/json",
                }
                payload = {
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.2,
                    "response_format": {"type": "json_object"},
                }
                with httpx.Client(timeout=25.0) as client:
                    resp = client.post(GROQ_URL, headers=headers, json=payload)
                    if resp.status_code == 200:
                        content = resp.json()["choices"][0]["message"]["content"].strip()
                        if content.startswith("```"):
                            content = content.split("```")[1]
                            if content.startswith("json"):
                                content = content[4:]
                        return content.strip()
                    elif resp.status_code == 429:
                        logger.warning(f"Groq Key {attempt_idx + 1} hit 429, rotating to next key...")
            except Exception as e:
                logger.warning(f"Groq JSON generation failed on key {attempt_idx + 1}: {e}")

    try:
        return generate_json(prompt)
    except Exception as e:
        logger.warning(f"Gemini generate_json failed ({e}), trying DeepSeek fallback...")

    openrouter_key = get_openrouter_key()
    if openrouter_key:
        try:
            import httpx
            headers = {
                "Authorization": f"Bearer {openrouter_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": "deepseek/deepseek-chat",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.2,
            }
            with httpx.Client(timeout=25.0) as client:
                resp = client.post(OPENROUTER_URL, headers=headers, json=payload)
                if resp.status_code == 200:
                    content = resp.json()["choices"][0]["message"]["content"].strip()
                    if content.startswith("```"):
                        content = content.split("```")[1]
                        if content.startswith("json"):
                            content = content[4:]
                    return content.strip()
        except Exception as e:
            logger.warning(f"DeepSeek JSON fallback failed: {e}")

    raise HTTPException(
        status_code=429,
        detail="AI service is temporarily overloaded. Please wait a moment and try again."
    )
