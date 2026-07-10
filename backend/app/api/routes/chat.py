"""
Context-aware chat — one-shot and streaming endpoints.

Two modes:
  GROUNDED  — user has uploaded documents and the question matches them.
              Answers come exclusively from the student's own materials.
              Google Search is OFF — we want citations from their notes, not the web.

  GENERAL   — no documents, or no sufficiently similar chunks found.
              Google Search is ON — Cognera can answer current-events questions,
              look up recent research, explain concepts with up-to-date examples.
              This is what makes Cognera actually useful as a general study companion
              rather than a bot that refuses anything not in a PDF.
"""
import json
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.auth import CurrentUser, get_current_user
from app.db.supabase_client import get_supabase, call_supabase
from app.services.gemini_client import (
    embed_text,
    generate_text,
    generate_text_with_search,
    generate_text_stream,
    generate_text_stream_with_search,
    to_pgvector_literal,
)

router = APIRouter(prefix="/chat", tags=["chat"])

SIMILARITY_THRESHOLD = 0.55
CONTEXT_CHUNKS = 5

SYSTEM_GROUNDED = """You are Cognera, a precise AI study assistant.
You are answering using the student's own course materials provided below.
Rules:
- Answer directly and concisely from the provided sources.
- Cite which source number supports each claim: (Source 1), (Source 2), etc.
- If the materials don't contain the answer, say so clearly, then offer a brief general explanation.
- You may add "Beyond your materials:" to signal supplementary general knowledge.
- Use markdown — headings, bullets, bold — to structure your response.
- Be a tutor, not a chatbot. No filler phrases."""

SYSTEM_GENERAL = """You are Cognera, an intelligent AI study companion with access to web search.
You can answer questions about anything — course concepts, current events, recent research, code, and general knowledge.
Rules:
- For current events or factual questions, search the web to get accurate, up-to-date information.
- For academic questions, be precise and give examples.
- For code, provide working solutions with brief explanations.
- For general knowledge, be clear and concise.
- Use markdown formatting to structure longer answers.
- If asked about something outside your knowledge, use search rather than refusing."""


class AskRequest(BaseModel):
    question: str


class Source(BaseModel):
    document_id: str
    document_title: str
    snippet: str


class AskResponse(BaseModel):
    answer: str
    sources: list[Source]
    mode: str


def _retrieve(user_id: str, question: str):
    """Embed the question and find the most relevant chunks from the user's documents."""
    embedding = embed_text(question)
    result = call_supabase(lambda: get_supabase().rpc(
        "match_document_chunks",
        {
            "query_embedding": to_pgvector_literal(embedding),
            "match_user_id": user_id,
            "match_count": CONTEXT_CHUNKS,
        },
    ).execute())
    chunks = result.data or []
    return [c for c in chunks if (c.get("similarity") or 0) >= SIMILARITY_THRESHOLD]


def _build_prompt(question: str, relevant_chunks: list) -> str:
    if relevant_chunks:
        context = "\n\n".join(
            f"[Source {i+1}: {c['document_title']}]\n{c['content']}"
            for i, c in enumerate(relevant_chunks)
        )
        return f"{SYSTEM_GROUNDED}\n\n---\n{context}\n---\n\nQuestion: {question}"
    return f"{SYSTEM_GENERAL}\n\nQuestion: {question}"


@router.post("/ask", response_model=AskResponse)
def ask(req: AskRequest, user: CurrentUser = Depends(get_current_user)):
    relevant = _retrieve(user.id, req.question)
    prompt = _build_prompt(req.question, relevant)
    grounded = bool(relevant)

    # Use web search only when not grounded in documents
    answer = generate_text(prompt) if grounded else generate_text_with_search(prompt)

    sources = [
        Source(
            document_id=c["document_id"],
            document_title=c["document_title"],
            snippet=c["content"][:200],
        )
        for c in relevant
    ]
    return AskResponse(answer=answer, sources=sources, mode="grounded" if grounded else "general")


@router.post("/stream")
def stream_ask(req: AskRequest, user: CurrentUser = Depends(get_current_user)):
    """SSE streaming. Yields text chunks then a final 'done' event with metadata."""
    relevant = _retrieve(user.id, req.question)
    prompt = _build_prompt(req.question, relevant)
    grounded = bool(relevant)
    mode = "grounded" if grounded else "general"
    sources = [
        {
            "document_id": c["document_id"],
            "document_title": c["document_title"],
            "snippet": c["content"][:200],
        }
        for c in relevant
    ]

    # Select the right generator: grounded uses pure document context,
    # general uses Google Search for current/real-world questions.
    stream_fn = generate_text_stream if grounded else generate_text_stream_with_search

    def event_stream():
        try:
            for text_chunk in stream_fn(prompt):
                payload = json.dumps({"type": "text", "text": text_chunk})
                yield f"data: {payload}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            return
        yield f"data: {json.dumps({'type': 'done', 'sources': sources, 'mode': mode})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
