"""
Context-aware chat — one-shot and streaming endpoints.
"""
import json
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.auth import CurrentUser, get_current_user
from app.db.supabase_client import get_supabase, call_supabase
from app.services.gemini_client import (
    embed_text, generate_text, generate_text_stream, to_pgvector_literal
)

router = APIRouter(prefix="/chat", tags=["chat"])

SIMILARITY_THRESHOLD = 0.55
CONTEXT_CHUNKS = 5

SYSTEM_GROUNDED = """You are Cognera, a precise AI study assistant.
You answer using the student's own course materials provided below.
Rules:
- Answer directly and concisely from the provided sources.
- Cite which source supports each claim: (Source 1), (Source 2), etc.
- If the materials don't contain the answer, say so, then offer a brief general explanation.
- After a grounded answer, you may add "Beyond your materials:" for relevant context.
- Use markdown formatting — headings, bullets, bold — to structure your response clearly.
- Never pad with filler phrases. Be a tutor, not a chatbot."""

SYSTEM_GENERAL = """You are Cognera, an intelligent study companion.
No document context is available for this question.
Rules:
- Answer with clarity and precision. Students need to understand, not just read.
- Use examples when explaining concepts.
- Structure longer answers with headings and bullets.
- For code questions: provide working code with brief explanations.
- Be direct. Avoid filler. Act like the smartest person in the study group."""


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
    """Embed question, retrieve relevant chunks, determine mode."""
    embedding = embed_text(question)
    result = call_supabase(lambda: get_supabase().rpc(
        "match_document_chunks",
        {"query_embedding": to_pgvector_literal(embedding),
         "match_user_id": user_id, "match_count": CONTEXT_CHUNKS},
    ).execute())
    chunks = result.data or []
    relevant = [c for c in chunks if (c.get("similarity") or 0) >= SIMILARITY_THRESHOLD]
    return relevant


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
    answer = generate_text(prompt)
    sources = [Source(document_id=c["document_id"], document_title=c["document_title"],
                      snippet=c["content"][:200]) for c in relevant]
    return AskResponse(answer=answer, sources=sources,
                       mode="grounded" if relevant else "general")


@router.post("/stream")
def stream_ask(req: AskRequest, user: CurrentUser = Depends(get_current_user)):
    """SSE streaming endpoint. Yields text chunks as they arrive from Gemini,
    followed by a final 'done' event containing sources and mode metadata."""
    relevant = _retrieve(user.id, req.question)
    prompt = _build_prompt(req.question, relevant)
    mode = "grounded" if relevant else "general"
    sources = [{"document_id": c["document_id"], "document_title": c["document_title"],
                "snippet": c["content"][:200]} for c in relevant]

    def event_stream():
        try:
            for text_chunk in generate_text_stream(prompt):
                payload = json.dumps({"type": "text", "text": text_chunk})
                yield f"data: {payload}\n\n"
        except Exception as e:
            error = json.dumps({"type": "error", "message": str(e)})
            yield f"data: {error}\n\n"
            return
        done = json.dumps({"type": "done", "sources": sources, "mode": mode})
        yield f"data: {done}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
