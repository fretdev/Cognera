"""
Cognera — Chat API Route (Production-Patched v2.1)
====================================================
No external cache dependencies. Uses simple dict with TTL.
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
    generate_stream,
    web_search,
)

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)

SIMILARITY_THRESHOLD = 0.20
CONTEXT_CHUNKS = 3

# Simple cache with TTL (no external deps)
_orchestrator_cache = {}
_CACHE_TTL = 60


SYSTEM_PROMPT = """You are Cognera, an AI study assistant. Your job is to HELP, not to ask questions.

## CORE RULES (follow in order):

1. **ALWAYS search documents first** if the student has uploaded materials.
   Call tool_search_documents for ANY of these:
   - Questions about topics, concepts, theories, definitions
   - Requests for summaries, overviews, key points
   - "What is in my notes", "what did I upload", "my documents"
   - Study help, exam prep, homework questions
   - ANYTHING that could plausibly be in course materials

2. **NEVER ask the user to clarify.** If their query is vague, search their
   documents and give the best answer you can from the results. If the
   documents don't have the answer, say so clearly — then offer to search
   the web or suggest what to upload.

3. **Call tool_search_web ONLY for:**
   - Current events, news, weather, sports scores, stock prices
   - "What happened yesterday", "latest research", "recent developments"
   - Explicit requests: "search Google", "look this up online"
   - After tool_search_documents returns ZERO results

4. **You may call BOTH tools** if the question needs both context
   (e.g., "compare my notes on relativity with current research").

5. **If no tools are needed**, answer directly (math, logic, creative writing).

## CITATION RULES:
- When citing documents: (Source: Document Title)
- When citing web: (Source: Website Name)
- Use markdown: headings, bullets, bold for key terms
- Be concise but thorough

## RESPONSE STYLE:
- Direct. No "I'd be happy to help!" fluff.
- If documents are empty: "I searched your materials but didn't find relevant
  content on [topic]. Here's what I found online:" [web results]
- If no docs uploaded: "You haven't uploaded any documents yet. You can add
  materials via the + button. Here's what I found online:" [web results]"""

NO_DOCS_NUDGE = (
    "\n\nNote: This student has not uploaded any documents yet. "
    "If they ask about their notes/materials, mention briefly that they "
    "can upload files via the + button, then answer from general knowledge "
    "or web search."
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
    "latest version", "current release",
}


def _is_obviously_web_query(query: str) -> bool:
    q_lower = query.lower()
    for keyword in WEB_ONLY_KEYWORDS:
        if keyword in q_lower:
            return True
    if any(word in q_lower for word in ["2025", "2026", "this year", "last year"]):
        return True
    return False


DOC_SIGNALS = {
    "my notes", "my documents", "my files", "my uploads", "i uploaded",
    "the pdf", "the document", "the file", "the slides", "the textbook",
    "this document", "this file", "this pdf", "the uploaded", "recent upload",
    "attachment", "notes", "study", "quiz", "flashcards", "presentation", "deck",
    "chapter", "section", "lecture", "course", "class", "professor",
    "study guide", "exam prep", "quiz me",
    "summarize", "overview", "key points", "main topics", "important details",
    "what is covered", "what does it say", "explain this concept",
    "how does this work", "what is the difference between",
    "compare and contrast", "definition of", "meaning of", "break down",
}

IMPLICIT_PRONOUNS = {
    "it", "that", "this section", "these", "those",
    "what does it", "explain it", "tell me about it", "summarize it",
    "is it", "can you explain this", "in here", "from this", "this topic",
}

AMBIGUOUS_FILE_PATTERNS = [
    "which document", "which file", "which pdf", "which notes", "which upload",
    "what document", "what file", "what pdf", "which one should i read",
    "which file should i read", "what notes do i have",
]


def _is_document_query(query: str, has_active_docs: bool = False, has_doc_history: bool = False) -> bool:
    q_lower = query.lower()
    for signal in DOC_SIGNALS:
        if signal in q_lower:
            return True

    if has_active_docs or has_doc_history:
        for p in IMPLICIT_PRONOUNS:
            if p in q_lower:
                return True
        words = set(q_lower.split())
        if words.intersection({"it", "that", "this", "these", "those"}):
            return True

    return False


def _check_smart_disambiguation(query: str, user_id: str, doc_count: int) -> str | None:
    if doc_count <= 1:
        return None

    q_lower = query.lower()
    if any(pattern in q_lower for pattern in AMBIGUOUS_FILE_PATTERNS):
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
    "description": (
        "Search the student's uploaded documents for relevant content. "
        "ALWAYS call this first when the student has uploaded materials, "
        "unless they are asking about current events, weather, sports, or news."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Search query optimized for semantic document retrieval"
            },
            "match_count": {
                "type": "integer",
                "description": "Number of chunks to retrieve. Default 10."
            },
        },
        "required": ["query"],
    },
}

TOOL_SEARCH_WEB = {
    "name": "tool_search_web",
    "description": (
        "Search the open web for current or general information. "
        "Use ONLY for: current events, weather, sports, news, or when "
        "document search returns no results."
    ),
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


def _tools_for_scope(scope_mode: str | None, force_doc_search: bool = False) -> list:
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

    if scope_mode == "documents_only" or force_doc_search:
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
        relevant = [c for c in chunks if (
            c.get("similarity") or 0) >= SIMILARITY_THRESHOLD][:3]
        if scope_document_ids:
            relevant = [c for c in relevant if c["document_id"]
                        in scope_document_ids]
        for c in relevant:
            if "content" in c and isinstance(c["content"], str):
                c["content"] = c["content"][:500]
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
                logger.warning(
                    f"last_accessed_at bump failed for user {user_id}: {e}")

        task = asyncio.create_task(_safe_bump())
        task.add_done_callback(lambda t: t.exception()
                               if t.exception() else None)

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
                if not any(s["document_id"] == doc_id for s in sources_out):
                    sources_out.append({
                        "document_id": doc_id,
                        "document_title": c["document_title"],
                        "snippet": c["content"][:200],
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
    has_doc_history: bool = False


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
        tools = _tools_for_scope("auto", force_doc_search=True)
        mode_used = "grounded"

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": question},
    ]

    first = await asyncio.to_thread(generate_with_tools, messages, tools)

    if not first.function_calls:
        # Active session fallback
        if doc_count > 0 and scope_mode != "web_only" and not _is_obviously_web_query(question):
            sources: list[dict] = []
            proactive_res = await tool_search_documents(question, user_id, scope_document_ids=scope_document_ids)
            if proactive_res["chunks"]:
                for c in proactive_res["chunks"]:
                    doc_id = c["document_id"]
                    if not any(s["document_id"] == doc_id for s in sources):
                        sources.append({
                            "document_id": doc_id,
                            "document_title": c["document_title"],
                            "snippet": c["content"][:200],
                        })
                trace.append({"tool": "tool_search_documents", "status": "done", "summary": proactive_res["summary"]})
                return first.text, sources, trace, "grounded"
        return first.text, [], trace, mode_used

    sources: list[dict] = []
    executor = _make_tool_executor(user_id, scope_document_ids, sources)

    async def _run_call(call):
        trace.append({"tool": call.name, "status": "running"})
        result = await executor(call)
        trace.append({"tool": call.name, "status": "done",
                     "summary": result["summary"]})
        return call.name, result

    results = await asyncio.gather(*(_run_call(c) for c in first.function_calls))

    doc_result = None
    web_result = None
    for name, result in results:
        if name == "tool_search_documents":
            doc_result = result
        elif name == "tool_search_web":
            web_result = result

    if (doc_result and doc_result["count"] == 0 and
        not web_result and
            scope_mode != "documents_only"):
        trace.append({"tool": "tool_search_web",
                     "status": "running", "note": "auto-fallback"})
        web_result = await tool_search_web(question, 5)
        trace.append({"tool": "tool_search_web", "status": "done",
                     "summary": web_result["summary"]})
        mode_used = "general"
        results = list(results)
        results.append(("tool_search_web", web_result))

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
        req.question, user.id, req.scope_mode, req.scope_document_ids, req.has_doc_history
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

            # Smart Disambiguation Check
            disambig = _check_smart_disambiguation(req.question, user.id, doc_count)
            if disambig:
                yield f"data: {json.dumps({'type': 'text', 'content': disambig})}\n\n"
                yield f"data: {json.dumps({'type': 'done', 'sources': [], 'trace': [], 'mode': 'general'})}\n\n"
                return

            system = SYSTEM_PROMPT + (NO_DOCS_NUDGE if doc_count == 0 else "")

            is_doc = _is_document_query(
                req.question,
                has_active_docs=(doc_count > 0),
                has_doc_history=req.has_doc_history,
            )

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
                tools = _tools_for_scope("auto", force_doc_search=True)
                mode_used = "grounded"

            messages = [
                {"role": "system", "content": system},
                {"role": "user", "content": req.question},
            ]

            yield f"data: {json.dumps({'type': 'trace', 'step': 'thinking'})}\n\n"

            executor = _make_tool_executor(
                user.id, req.scope_document_ids, sources)

            async for evt in generate_stream(messages, tools=tools, execute_tool=executor):
                if evt["type"] == "trace":
                    trace.append(evt)
                yield f"data: {json.dumps(evt)}\n\n"

            doc_trace = [t for t in trace if t.get(
                "tool") == "tool_search_documents"]
            web_trace = [t for t in trace if t.get(
                "tool") == "tool_search_web"]

            # Active Session Proactive Fallback
            if doc_count > 0 and not doc_trace and not web_trace and req.scope_mode != "web_only" and not _is_obviously_web_query(req.question):
                proactive_res = await tool_search_documents(req.question, user.id, scope_document_ids=req.scope_document_ids)
                if proactive_res["chunks"]:
                    for c in proactive_res["chunks"]:
                        doc_id = c["document_id"]
                        if not any(s["document_id"] == doc_id for s in sources):
                            sources.append({
                                "document_id": doc_id,
                                "document_title": c["document_title"],
                                "snippet": c["content"][:200],
                            })
                    trace.append({"tool": "tool_search_documents", "status": "done", "summary": proactive_res["summary"]})

            doc_empty = any(
                t.get("summary", "").startswith("No document")
                for t in doc_trace if t.get("status") == "done"
            )

            if doc_empty and not web_trace and req.scope_mode != "documents_only":
                yield f"data: {json.dumps({'type': 'trace', 'step': 'Auto-fallback to web search'})}\n\n"
                trace.append({"tool": "tool_search_web",
                             "status": "running", "note": "auto-fallback"})
                web_result = await tool_search_web(req.question, 5)
                trace.append({"tool": "tool_search_web", "status": "done",
                             "summary": web_result["summary"]})
                mode_used = "general"

                from app.services.gemini_client import async_stream_text
                fallback_prompt = f"{system}\n\nThe user's question: {req.question}\n\nWeb search results: {json.dumps(web_result['results'][:3])}\n\nProvide a helpful answer based on these web results."
                async for chunk in async_stream_text(fallback_prompt):
                    yield f"data: {json.dumps({'type': 'text', 'content': chunk})}\n\n"

            tools_used = {t["tool"]
                          for t in trace if t.get("status") == "done"}
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
