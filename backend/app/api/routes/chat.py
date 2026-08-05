"""
Cognera — Chat API Route (RAG & Multi-Turn Upgraded v3.1)
==========================================================
- Multi-turn conversation memory (passes recent turns to Gemini)
- Untruncated full chunk context retrieval
- Document scope filtering & smart intent routing
- Direct answers for general knowledge/math/trivia without unnecessary tool forcing
- Permission-gated Web Search only when note searches yield zero matches for document queries
"""

import asyncio
import json
import logging
import time
from typing import Any, AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.auth import CurrentUser, get_current_user
from app.db.supabase_client import get_supabase, call_supabase
from app.services.gemini_client import (
    embed_text,
    generate_with_tools,
    web_search,
)
from app.services.multi_model_client import stream_multi_provider_text

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)

SIMILARITY_THRESHOLD = 0.20
CONTEXT_CHUNKS = 6

SYSTEM_PROMPT = """You are Cognera, an AI study assistant. Your job is to HELP students learn accurately, quickly, and directly.

## TOOL SELECTION RULES:

1. **General Knowledge / Math / Trivia / Writing / Logic**:
   Answer DIRECTLY from your knowledge base. Do NOT call tools for basic facts, math, geography (e.g. "What's the capital of France", "2+2"), grammar, or general explanations.

2. **Uploaded Documents / Course Notes / Homework**:
   Call `tool_search_documents` when the user asks about their notes, uploaded files, course materials, lectures, or specific study topics.

3. **Current Events / News / Explicit Web Search**:
   Call `tool_search_web` ONLY for breaking news, current dates, weather, live stock/sports data, or when the user explicitly requests web search.

## RESPONSE STYLE:
- Direct, academic, clear, and concise. No conversational fluff.
- When citing documents: (Source: Document Title)
- Use clean Markdown formatting.
"""

NO_DOCS_NUDGE = (
    "\n\nNote: This student has not uploaded any documents yet. "
    "If they ask about their notes/materials, mention briefly that they "
    "can upload files via the + button."
)

WEB_ONLY_KEYWORDS = {
    "news", "yesterday", "today", "last week", "last month", "recently",
    "breaking", "headlines", "current events",
    "weather", "temperature", "forecast", "rain", "snow", "sunny",
    "score", "won", "lost", "match", "game", "tournament", "championship",
    "world cup", "super bowl", "olympics",
    "stock price", "stock market", "bitcoin", "crypto", "trading",
    "died", "passed away", "married", "divorced", "celebrity",
    "search google", "look up online", "what does the internet say",
    "latest version", "current release", "search web", "web search",
}

DOC_SIGNALS = {
    "my notes", "my documents", "my files", "my uploads", "i uploaded",
    "the pdf", "the document", "the file", "the slides", "the textbook",
    "this document", "this file", "this pdf", "the uploaded", "recent upload",
    "attachment", "notes", "study guide", "exam prep", "quiz me",
    "chapter", "section", "lecture", "course", "class", "professor",
}

WEB_PERMISSION_AFFIRMATIVE = {
    "yes", "yeah", "sure", "go ahead", "search web", "search google",
    "look online", "ok", "okay", "please do", "yep", "do it", "find online",
}


def _is_obviously_web_query(query: str) -> bool:
    q_lower = query.lower()
    for keyword in WEB_ONLY_KEYWORDS:
        if keyword in q_lower:
            return True
    if any(word in q_lower for word in ["2025", "2026", "this year", "last year"]):
        return True
    return False


def _is_document_signal_query(query: str) -> bool:
    q_lower = query.lower()
    return any(signal in q_lower for signal in DOC_SIGNALS)


def _has_web_permission(query: str, history: list[dict] | None = None) -> bool:
    q_lower = query.lower().strip()
    if any(k in q_lower for k in WEB_PERMISSION_AFFIRMATIVE):
        return True
    if history:
        for msg in reversed(history[-2:]):
            content = (msg.get("content") or "").lower()
            if "search the web" in content or "look online" in content:
                if any(w in q_lower for w in ["yes", "sure", "ok", "yeah", "go ahead", "please"]):
                    return True
    return False


def _check_smart_disambiguation(query: str, user_id: str, doc_count: int) -> str | None:
    if doc_count <= 1:
        return None

    q_lower = query.lower()
    if any(pattern in q_lower for pattern in ["which document", "which file", "what notes do i have"]):
        try:
            res = call_supabase(lambda: get_supabase()
                                .table("documents")
                                .select("id, title")
                                .eq("user_id", user_id)
                                .limit(10)
                                .execute())
            docs = res.data or []
            if len(docs) > 1:
                title_list = "\n".join(f"- **{d['title']}**" for d in docs)
                return (
                    f"You have **{len(docs)} documents** uploaded in your workspace:\n\n"
                    f"{title_list}\n\n"
                    "Which specific file would you like me to analyze or summarize for you?"
                )
        except Exception:
            pass
    return None


TOOL_SEARCH_DOCUMENTS = {
    "name": "tool_search_documents",
    "description": "Search the student's uploaded documents for relevant content.",
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Search query optimized for semantic document retrieval"
            },
            "match_count": {
                "type": "integer",
                "description": "Number of chunks to retrieve. Default 6."
            },
        },
        "required": ["query"],
    },
}

TOOL_SEARCH_WEB = {
    "name": "tool_search_web",
    "description": "Search the open web for current or general information.",
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "num_results": {
                "type": "integer",
                "description": "Default 5."
            },
        },
        "required": ["query"],
    },
}


def _tools_for_scope(scope_mode: str | None) -> list:
    from google.genai import types

    doc_tool = types.Tool(function_declarations=[
        types.FunctionDeclaration(
            name=TOOL_SEARCH_DOCUMENTS["name"],
            description=TOOL_SEARCH_DOCUMENTS["description"],
            parameters=types.Schema(**TOOL_SEARCH_DOCUMENTS["parameters"]),
        )
    ])
    web_tool = types.Tool(function_declarations=[
        types.FunctionDeclaration(
            name=TOOL_SEARCH_WEB["name"],
            description=TOOL_SEARCH_WEB["description"],
            parameters=types.Schema(**TOOL_SEARCH_WEB["parameters"]),
        )
    ])

    if scope_mode == "documents_only":
        return [doc_tool]
    if scope_mode == "web_only":
        return [web_tool]
    return [doc_tool, web_tool]


async def tool_search_documents(
    query: str,
    user_id: str,
    match_count: int = CONTEXT_CHUNKS,
    scope_document_ids: list[str] | None = None,
) -> dict[str, Any]:
    def _run() -> list[dict]:
        embedding = embed_text(query)
        result = call_supabase(lambda: get_supabase().rpc(
            "match_document_chunks",
            {
                "query_embedding": embedding,
                "match_user_id": user_id,
                "match_count": match_count,
            },
        ).execute())
        chunks = result.data or []
        relevant = [c for c in chunks if (c.get("similarity") or 0) >= SIMILARITY_THRESHOLD]
        if scope_document_ids:
            relevant = [c for c in relevant if c["document_id"] in scope_document_ids]
        return relevant

    relevant = await asyncio.to_thread(_run)

    if relevant:
        doc_ids = list({c["document_id"] for c in relevant})

        def _bump():
            call_supabase(lambda: get_supabase()
                          .table("documents")
                          .update({"last_accessed_at": "now()"})
                          .in_("id", doc_ids)
                          .eq("user_id", user_id)
                          .execute())

        async def _safe_bump():
            try:
                await asyncio.to_thread(_bump)
            except Exception as e:
                logger.warning(f"last_accessed_at bump failed for user {user_id}: {e}")

        task = asyncio.create_task(_safe_bump())
        task.add_done_callback(lambda t: t.exception() if t.exception() else None)

    return {
        "chunks": relevant,
        "count": len(relevant),
        "summary": (
            f"Found {len(relevant)} relevant document section(s)."
            if relevant else "No document sections matched this question."
        ),
    }


async def tool_search_web(query: str, num_results: int = 5) -> dict[str, Any]:
    results = await asyncio.to_thread(web_search, query, num_results)
    return {
        "results": results,
        "count": len(results),
        "summary": f"Found {len(results)} web result(s).",
    }


TOOL_DISPATCH = {
    "tool_search_documents": tool_search_documents,
    "tool_search_web": tool_search_web,
}


def _make_tool_executor(
    user_id: str,
    scope_document_ids: list[str] | None,
    sources_out: list[dict],
):
    async def _execute(call) -> dict:
        fn = TOOL_DISPATCH[call.name]
        if call.name == "tool_search_documents":
            result = await fn(
                query=call.args.get("query", ""),
                user_id=user_id,
                match_count=call.args.get("match_count", CONTEXT_CHUNKS),
                scope_document_ids=scope_document_ids,
            )
            for c in result["chunks"]:
                doc_id = c["document_id"]
                doc_title = c.get("document_title") or "Document"
                if not any(s["document_id"] == doc_id for s in sources_out):
                    sources_out.append({
                        "document_id": doc_id,
                        "document_title": doc_title,
                        "snippet": c.get("content", "")[:200],
                    })
            return result
        return await fn(
            query=call.args.get("query", ""),
            num_results=call.args.get("num_results", 5),
        )
    return _execute


def _count_user_documents(user_id: str) -> int:
    try:
        res = call_supabase(lambda: get_supabase()
                            .table("documents")
                            .select("id", count="exact")
                            .eq("user_id", user_id)
                            .limit(1)
                            .execute())
        return res.count or 0
    except Exception:
        return 0


class AskRequest(BaseModel):
    question: str
    scope_mode: str | None = None
    scope_document_ids: list[str] | None = None
    conversation_id: str | None = None
    conversation_history: list[dict] | None = None
    has_doc_history: bool = False
    preferred_model: str | None = "auto"


class Source(BaseModel):
    document_id: str
    document_title: str
    snippet: str


class AskResponse(BaseModel):
    answer: str
    sources: list[Source]
    trace: list[dict]


async def _run_agent_turn(
    question: str,
    user_id: str,
    scope_mode: str | None,
    scope_document_ids: list[str] | None,
    conversation_history: list[dict] | None = None,
    has_doc_history: bool = False,
) -> tuple[str, list[dict], list[dict], str]:
    trace: list[dict] = []
    doc_count = await asyncio.to_thread(_count_user_documents, user_id)

    disambig = _check_smart_disambiguation(question, user_id, doc_count)
    if disambig:
        return disambig, [], [], "general"

    system = SYSTEM_PROMPT + (NO_DOCS_NUDGE if doc_count == 0 else "")

    if doc_count == 0:
        tools = _tools_for_scope("web_only")
        mode_used = "general"
    elif scope_mode == "documents_only":
        tools = _tools_for_scope("documents_only")
        mode_used = "grounded"
    elif scope_mode == "web_only":
        tools = _tools_for_scope("web_only")
        mode_used = "general"
    elif _is_obviously_web_query(question):
        tools = _tools_for_scope("web_only")
        mode_used = "general"
    else:
        tools = _tools_for_scope(scope_mode)
        mode_used = "grounded" if _is_document_signal_query(question) else "general"

    messages = [{"role": "system", "content": system}]
    if conversation_history:
        for msg in conversation_history[-10:]:
            role = "user" if msg.get("role") == "user" else "assistant"
            content = msg.get("content", "")
            if content:
                messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": question})

    first = await asyncio.to_thread(generate_with_tools, messages, tools)

    if not first.function_calls:
        return first.text, [], trace, mode_used

    sources: list[dict] = []
    executor = _make_tool_executor(user_id, scope_document_ids, sources)

    async def _run_call(call):
        trace.append({"tool": call.name, "status": "running"})
        result = await executor(call)
        trace.append({"tool": call.name, "status": "done", "summary": result["summary"]})
        return call.name, result

    results = await asyncio.gather(*(_run_call(c) for c in first.function_calls))

    doc_result = None
    web_result = None
    for name, result in results:
        if name == "tool_search_documents":
            doc_result = result
        elif name == "tool_search_web":
            web_result = result

    # Only ask for web search permission if tool_search_documents WAS explicitly called and returned 0 results
    if doc_result and doc_result["count"] == 0 and not web_result and scope_mode != "documents_only":
        if _has_web_permission(question, conversation_history):
            trace.append({"tool": "tool_search_web", "status": "running", "note": "user-consented-web-search"})
            web_result = await tool_search_web(question, 5)
            trace.append({"tool": "tool_search_web", "status": "done", "summary": web_result["summary"]})
            mode_used = "general"
            results = list(results)
            results.append(("tool_search_web", web_result))
        else:
            prompt_permission = (
                "I searched your uploaded study materials, but couldn't find information regarding this question. "
                "Would you like me to search the web for you?"
            )
            return prompt_permission, [], trace, "grounded"

    from google.genai import types
    from app.services.gemini_client import _messages_to_contents

    sdk_msgs = _messages_to_contents(messages)
    if first.model_content:
        sdk_msgs.append(first.model_content)
    else:
        fc_parts = [types.Part.from_function_call(name=c.name, args=c.args) for c in first.function_calls]
        sdk_msgs.append(types.Content(role="model", parts=fc_parts))

    func_parts = [
        types.Part.from_function_response(name=name, response=result)
        for name, result in results
    ]
    sdk_msgs.append(types.Content(role="user", parts=func_parts))

    final = await asyncio.to_thread(generate_with_tools, sdk_msgs, tools)
    return final.text, sources, trace, mode_used


@router.post("/ask", response_model=AskResponse)
async def ask(req: AskRequest, user: CurrentUser = Depends(get_current_user)):
    answer, sources, trace, mode = await _run_agent_turn(
        req.question, user.id, req.scope_mode, req.scope_document_ids, req.conversation_history, req.has_doc_history
    )
    return AskResponse(
        answer=answer,
        sources=[Source(**s) for s in sources],
        trace=trace,
    )


@router.post("/stream")
async def stream_ask(req: AskRequest, user: CurrentUser = Depends(get_current_user)):

    async def event_stream() -> AsyncIterator[str]:
        sources: list[dict] = []
        trace: list[dict] = []

        try:
            doc_count = await asyncio.to_thread(_count_user_documents, user.id)

            disambig = _check_smart_disambiguation(req.question, user.id, doc_count)
            if disambig:
                yield f"data: {json.dumps({'type': 'text', 'content': disambig})}\n\n"
                yield f"data: {json.dumps({'type': 'done', 'sources': [], 'trace': [], 'mode': 'general'})}\n\n"
                return

            system = SYSTEM_PROMPT + (NO_DOCS_NUDGE if doc_count == 0 else "")

            if doc_count == 0:
                tools = _tools_for_scope("web_only")
                mode_used = "general"
            elif req.scope_mode == "documents_only":
                tools = _tools_for_scope("documents_only")
                mode_used = "grounded"
            elif req.scope_mode == "web_only":
                tools = _tools_for_scope("web_only")
                mode_used = "general"
            elif _is_obviously_web_query(req.question):
                tools = _tools_for_scope("web_only")
                mode_used = "general"
            else:
                tools = _tools_for_scope(req.scope_mode)
                mode_used = "grounded" if _is_document_signal_query(req.question) else "general"

            messages = [{"role": "system", "content": system}]
            if req.conversation_history:
                for msg in req.conversation_history[-10:]:
                    role = "user" if msg.get("role") == "user" else "assistant"
                    content = msg.get("content", "")
                    if content:
                        messages.append({"role": role, "content": content})
            messages.append({"role": "user", "content": req.question})

            yield f"data: {json.dumps({'type': 'trace', 'step': 'thinking'})}\n\n"

            executor = _make_tool_executor(
                user.id, req.scope_document_ids, sources)

            async for evt in stream_multi_provider_text(
                messages, tools=tools, execute_tool=executor, preferred_model=req.preferred_model
            ):
                if evt["type"] == "trace":
                    trace.append(evt)
                yield f"data: {json.dumps(evt)}\n\n"

            doc_trace = [t for t in trace if t.get("tool") == "tool_search_documents"]
            web_trace = [t for t in trace if t.get("tool") == "tool_search_web"]

            doc_empty = any(
                t.get("summary", "").startswith("No document")
                for t in doc_trace if t.get("status") == "done"
            )

            if doc_empty and not web_trace and req.scope_mode != "documents_only":
                if _has_web_permission(req.question, req.conversation_history):
                    yield f"data: {json.dumps({'type': 'trace', 'step': 'Searching web with user permission'})}\n\n"
                    trace.append({"tool": "tool_search_web", "status": "running", "note": "user-consented-web-search"})
                    web_result = await tool_search_web(req.question, 5)
                    trace.append({"tool": "tool_search_web", "status": "done", "summary": web_result["summary"]})
                    mode_used = "general"

                    from app.services.gemini_client import async_stream_text
                    fallback_prompt = f"{system}\n\nThe user's question: {req.question}\n\nWeb search results: {json.dumps(web_result['results'][:3])}\n\nProvide a helpful answer based on these web results."
                    async for chunk in async_stream_text(fallback_prompt):
                        yield f"data: {json.dumps({'type': 'text', 'content': chunk})}\n\n"
                else:
                    no_match_text = (
                        "I searched your uploaded study materials, but couldn't find information regarding this question. "
                        "Would you like me to search the web for you?"
                    )
                    yield f"data: {json.dumps({'type': 'text', 'content': no_match_text})}\n\n"

            tools_used = {t["tool"] for t in trace if t.get("status") == "done"}
            has_docs = len(sources) > 0
            has_web = "tool_search_web" in tools_used

            if has_docs and has_web:
                mode = "hybrid"
            elif has_docs:
                mode = "grounded"
            elif has_web:
                mode = "general"
            else:
                mode = "general" if len(sources) == 0 else mode_used

            done_payload = {
                "type": "done",
                "sources": sources,
                "trace": trace,
                "mode": mode,
            }
            yield f"data: {json.dumps(done_payload)}\n\n"

        except Exception as e:
            logger.exception("Stream error for user %s", user.id)
            error_msg = str(e)
            is_429 = (
                "429" in error_msg or
                "quota" in error_msg.lower() or
                "rate limit" in error_msg.lower() or
                "resourceexhausted" in error_msg.lower() or
                "resource_exhausted" in error_msg.lower()
            )
            if is_429:
                yield f"data: {json.dumps({'type': 'error', 'message': 'AI quota temporarily busy. Please wait a moment.', 'code': 'RATE_LIMIT'})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
