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

## HOW TO ANSWER:

1. **General Knowledge / Math / Trivia / Writing / Logic**:
   Answer DIRECTLY and completely. Never say you cannot answer or suggest the user search elsewhere.

2. **Uploaded Documents / Course Notes**:
   When document context is provided below, use it to answer accurately and cite sources.

3. **Current Events / Real-Time Data**:
   When web search results are provided below, use them to answer accurately with markdown source links.

## CRITICAL RULES:
- NEVER mention internal tool names, function names, or suggest calling any tool.
- NEVER say "I'm unable to access real-time information" or "Would you like me to search".
- ALWAYS answer directly using whatever context is provided to you.
- If document or web context is provided, use it. If not, answer from your training knowledge.
- NEVER fabricate or guess URLs. Only include links that appear in the web search results provided to you. If no URL was provided in the search results, do NOT invent one.
- When you are uncertain about specific factual details (locations, dates, names), state what you know and note the uncertainty rather than guessing or making up information.
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
    # News & time
    "news", "yesterday", "today", "last week", "last month", "recently",
    "breaking", "headlines", "current events", "latest", "update",
    # Weather
    "weather", "temperature", "forecast", "rain", "snow", "sunny", "humidity",
    # Sports
    "score", "won", "lost", "match", "game", "tournament", "championship",
    "world cup", "super bowl", "olympics", "premier league", "la liga",
    # Finance
    "stock price", "stock market", "bitcoin", "crypto", "trading",
    "price of", "how much does", "exchange rate", "naira", "dollar rate",
    # People & celebrity
    "died", "passed away", "married", "divorced", "celebrity",
    # Politics & elections
    "election", "governor", "president", "senator", "minister",
    "inaugurated", "sworn in", "political", "campaign", "ballot",
    "voted", "polling", "primary", "running mate", "vice president",
    # Scheduling & events
    "taking place", "scheduled", "when is", "happening", "date of",
    "deadline", "registration", "admission", "result", "jamb", "waec", "neco",
    # Explicit web requests
    "search google", "look up online", "what does the internet say",
    "search the web", "search web", "web search", "find online",
    "look up", "google", "current release", "latest version",
    # General current-affairs triggers
    "right now", "presently", "at the moment", "this week", "this month",
    "current", "ongoing", "trending", "viral",
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
    if any(word in q_lower for word in ["2024", "2025", "2026", "2027", "this year", "last year"]):
        return True
    # Pattern-based detection for real-time questions
    import re
    web_patterns = [
        r"\bwhen is\b",           # "When is the election"
        r"\bwho is the current\b", # "Who is the current president"
        r"\bwho won\b",           # "Who won the match"
        r"\bhow much\b.*\bcost\b", # "How much does X cost"
        r"\bis .+ open\b",        # "Is the store open"
        r"\bwhat time\b",         # "What time does X start"
        r"\bwhere can i\b",       # "Where can I buy"
        r"\bhow to get to\b",     # "How to get to X"
    ]
    for pattern in web_patterns:
        if re.search(pattern, q_lower):
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
        relevant = []
        try:
            def _query_table():
                q = get_supabase().table("document_chunks").select("id, document_id, content, chunk_index").eq("user_id", user_id)
                if scope_document_ids:
                    q = q.in_("document_id", scope_document_ids)
                return q.order("chunk_index", desc=False).limit(match_count * 2).execute()

            direct_res = call_supabase(_query_table)
            if direct_res and direct_res.data:
                raw_chunks = direct_res.data
                doc_ids = list({c["document_id"] for c in raw_chunks if c.get("document_id")})
                title_map = {}
                if doc_ids:
                    try:
                        docs_res = call_supabase(lambda: get_supabase().table("documents").select("id, title").in_("id", doc_ids).execute())
                        if docs_res and docs_res.data:
                            title_map = {d["id"]: d["title"] for d in docs_res.data}
                    except Exception:
                        pass

                for c in raw_chunks:
                    doc_id = c.get("document_id", "")
                    relevant.append({
                        "id": c.get("id"),
                        "document_id": doc_id,
                        "content": c.get("content", ""),
                        "chunk_index": c.get("chunk_index", 0),
                        "document_title": title_map.get(doc_id, "Document"),
                    })
        except Exception as direct_err:
            logger.warning(f"Direct document_chunks table query error: {direct_err}")

        return relevant[:match_count]

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
    from app.services.web_search_helper import perform_free_web_search
    results = await asyncio.to_thread(web_search, query, num_results)
    if not results:
        results = await asyncio.to_thread(perform_free_web_search, query, num_results)
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

    messages = [{"role": "system", "content": system}]
    if conversation_history:
        for msg in conversation_history[-10:]:
            role = "user" if msg.get("role") == "user" else "assistant"
            content = msg.get("content", "")
            if content:
                messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": question})

    first = await asyncio.to_thread(generate_with_tools, messages, None)
    return first.text or "", [], trace, "general"


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
            # Send an immediate heartbeat so the frontend timeout never fires while we work
            yield f"data: {json.dumps({'type': 'trace', 'step': 'Connecting…'})}\n\n"

            doc_count = await asyncio.to_thread(_count_user_documents, user.id)

            disambig = _check_smart_disambiguation(req.question, user.id, doc_count)
            if disambig:
                yield f"data: {json.dumps({'type': 'text', 'content': disambig})}\n\n"
                yield f"data: {json.dumps({'type': 'done', 'sources': [], 'trace': [], 'mode': 'general'})}\n\n"
                return

            system = SYSTEM_PROMPT + (NO_DOCS_NUDGE if doc_count == 0 else "")
            mode_used = "general"

            # ---------------------------------------------------------------
            # ROUTING LOGIC (Flipped — Web search is the DEFAULT, not opt-in)
            # ---------------------------------------------------------------
            # If the user explicitly scoped to documents, or the query
            # clearly references their uploaded notes → search documents.
            # For ALL other queries → ALWAYS search the web so every question
            # gets real-time context regardless of keywords.
            # ---------------------------------------------------------------

            is_doc_scoped = (
                req.scope_mode == "documents_only" or
                (req.scope_document_ids is not None and len(req.scope_document_ids) > 0) or
                _is_document_signal_query(req.question)
            )

            should_search_docs = doc_count > 0 and is_doc_scoped

            if should_search_docs:
                yield f"data: {json.dumps({'type': 'trace', 'step': 'Searching study notes…'})}\n\n"
                doc_res = await tool_search_documents(
                    query=req.question,
                    user_id=user.id,
                    match_count=CONTEXT_CHUNKS,
                    scope_document_ids=req.scope_document_ids,
                )
                chunks = doc_res.get("chunks", [])
                if chunks:
                    mode_used = "grounded"
                    doc_context_blocks = []
                    for c in chunks:
                        doc_id = c["document_id"]
                        doc_title = c.get("document_title") or "Document"
                        if not any(s["document_id"] == doc_id for s in sources):
                            sources.append({
                                "document_id": doc_id,
                                "document_title": doc_title,
                                "snippet": c.get("content", "")[:200],
                            })
                        doc_context_blocks.append(f"Source: {doc_title}\n{c.get('content', '')}")

                    doc_context_text = "\n\n---\n\n".join(doc_context_blocks)
                    system += (
                        f"\n\n## RETRIEVED DOCUMENT CONTEXT FOR THIS USER QUESTION:\n"
                        f"{doc_context_text}\n\n"
                        f"Answer the student's question accurately using the document context above. Cite source titles when relevant."
                    )
                    trace.append({"tool": "tool_search_documents", "status": "done", "summary": f"Retrieved {len(chunks)} document section(s)."})

            # Web search for ALL non-document-scoped queries (the default path)
            should_search_web = not should_search_docs

            if should_search_web:
                yield f"data: {json.dumps({'type': 'trace', 'step': 'Searching the web…'})}\n\n"
                web_res = await tool_search_web(query=req.question, num_results=5)
                items = web_res.get("results", [])
                if items:
                    mode_used = "general"
                    web_context_blocks = []
                    for w in items:
                        title = w.get("title", "Web Page")
                        uri = w.get("uri", "")
                        snippet = w.get("snippet", "")
                        web_context_blocks.append(f"Source: {title} ({uri})\n{snippet}")

                    web_context_text = "\n\n---\n\n".join(web_context_blocks)
                    system += (
                        f"\n\n## REAL-TIME WEB SEARCH RESULTS FOR THIS QUESTION:\n"
                        f"{web_context_text}\n\n"
                        f"Answer the user's question accurately using the live web search results above. Provide markdown links [Title](URL) for sources when appropriate."
                    )
                    trace.append({"tool": "tool_search_web", "status": "done", "summary": f"Found {len(items)} web result(s)."})

            messages = [{"role": "system", "content": system}]
            if req.conversation_history:
                for msg in req.conversation_history[-10:]:
                    role = "user" if msg.get("role") == "user" else "assistant"
                    content = msg.get("content", "")
                    if content:
                        messages.append({"role": role, "content": content})
            messages.append({"role": "user", "content": req.question})

            yield f"data: {json.dumps({'type': 'trace', 'step': 'thinking'})}\n\n"

            # Pass tools=None because pre-retrieval has already injected document/web context into system prompt!
            async for evt in stream_multi_provider_text(
                messages, tools=None, execute_tool=None, preferred_model=req.preferred_model
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
                    from app.services.multi_model_client import stream_groq_qwen
                    fallback_prompt = f"{system}\n\nThe user's question: {req.question}\n\nWeb search results: {json.dumps(web_result['results'][:3])}\n\nProvide a helpful answer based on these web results."
                    try:
                        async for chunk in async_stream_text(fallback_prompt):
                            yield f"data: {json.dumps({'type': 'text', 'content': chunk})}\n\n"
                    except Exception as web_stream_err:
                        logger.warning(f"Gemini web stream failed ({web_stream_err}), using Groq fallback...")
                        async for chunk in stream_groq_qwen([{"role": "user", "content": fallback_prompt}], "llama-3.3-70b-versatile"):
                            if chunk.get("type") == "text":
                                yield f"data: {json.dumps({'type': 'text', 'content': chunk['content']})}\n\n"
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
            # Instead of showing an error, try to give a useful answer from
            # whatever context (web/doc) was already retrieved before the crash.
            try:
                # Extract any web/doc context that was already injected into system prompt
                context_lines = []
                if "## REAL-TIME WEB SEARCH RESULTS" in system:
                    ctx = system.split("## REAL-TIME WEB SEARCH RESULTS")[1]
                    context_lines.append(ctx.strip()[:2000])
                elif "## RETRIEVED DOCUMENT CONTEXT" in system:
                    ctx = system.split("## RETRIEVED DOCUMENT CONTEXT")[1]
                    context_lines.append(ctx.strip()[:2000])

                if context_lines:
                    fallback = (
                        f"Here's what I found regarding your question:\n\n"
                        f"{context_lines[0]}\n\n"
                        f"*Note: I summarized the search results directly due to a temporary processing issue.*"
                    )
                    yield f"data: {json.dumps({'type': 'text', 'content': fallback})}\n\n"
                else:
                    # No context was retrieved — give a helpful message, not a raw error
                    yield f"data: {json.dumps({'type': 'text', 'content': 'I encountered a temporary issue processing your request. Please try asking your question again in a moment.'})}\n\n"

                yield f"data: {json.dumps({'type': 'done', 'sources': sources, 'trace': trace, 'mode': 'general'})}\n\n"
            except Exception:
                # Absolute last resort
                yield f"data: {json.dumps({'type': 'text', 'content': 'Please try again in a moment.'})}\n\n"
                yield f"data: {json.dumps({'type': 'done', 'sources': [], 'trace': [], 'mode': 'general'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
