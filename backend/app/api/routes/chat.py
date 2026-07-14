"""
Context-aware chat — streaming and one-shot endpoints.

Document retrieval strategy:
  - Search ALL of the user's documents simultaneously via pgvector cosine
    similarity. This is the correct approach — vector search naturally
    surfaces the most relevant content regardless of which document it's in.
    Forcing users to pick a document would hurt recall significantly.
  - SIMILARITY_THRESHOLD lowered to 0.42 (was 0.55). The old value was too
    aggressive and discarded genuine matches when question phrasing differed
    from document phrasing (paraphrasing, different terminology, etc.)
  - CONTEXT_CHUNKS raised to 8 (was 5) to give the model richer context.
"""
import json
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.auth import CurrentUser, get_current_user
from app.db.supabase_client import get_supabase, call_supabase
from app.services.gemini_client import (
    embed_text, generate_text, generate_text_with_search,
    generate_text_stream, generate_text_stream_with_search,
    to_pgvector_literal,
)

router = APIRouter(prefix="/chat", tags=["chat"])

# Lowered from 0.55 — catches more genuine matches without significant noise
SIMILARITY_THRESHOLD = 0.42
# Raised from 5 — more context = better answers on complex topics
CONTEXT_CHUNKS = 8

SYSTEM_GROUNDED = """You are Cognera, a precise AI study assistant.
Answer using the student's own course materials provided as sources below.

Rules:
- Answer directly and concisely from the provided sources.
- Cite which source supports each claim: (Source 1), (Source 2), etc.
- If the materials don't contain a complete answer, clearly say so, then
  briefly supplement with general knowledge labelled "Beyond your materials:".
- Structure answers with markdown — headings, bullets, bold — for clarity.
- Be a tutor, not a chatbot. No filler phrases. No unnecessary padding."""

SYSTEM_GENERAL = """You are Cognera, an intelligent AI study companion with web search.
No document context matched this question — answering from general knowledge.

Rules:
- Be precise and clear. Students need understanding, not word count.
- Use examples when explaining concepts.
- Structure longer answers with headings and bullets.
- For code: provide working examples with brief explanations.
- Maintain a professional, academic tone."""


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


def _retrieve(user_id: str, question: str) -> list[dict]:
    """Embed question, search ALL user documents, return relevant chunks.

    We search all documents simultaneously — the student doesn't need to
    pick which document to query. Vector similarity naturally surfaces
    relevant content from whichever documents are most applicable.

    Also updates last_accessed_at on matched documents so the storage
    cleanup job knows which files are actively being used.
    """
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
    relevant = [c for c in chunks if (c.get("similarity") or 0) >= SIMILARITY_THRESHOLD]

    # Update last_accessed_at so storage cleanup knows these are active
    if relevant:
        doc_ids = list({c["document_id"] for c in relevant})
        try:
            call_supabase(lambda: get_supabase()
                .table("documents")
                .update({"last_accessed_at": "now()"})
                .in_("id", doc_ids)
                .eq("user_id", user_id)
                .execute()
            )
        except Exception:
            pass  # non-critical — don't fail a chat request over a metadata update

    return relevant


def _build_prompt(question: str, chunks: list) -> str:
    if chunks:
        context = "\n\n".join(
            f"[Source {i+1}: {c['document_title']} — similarity {c.get('similarity', 0):.2f}]\n{c['content']}"
            for i, c in enumerate(chunks)
        )
        return f"{SYSTEM_GROUNDED}\n\n---\n{context}\n---\n\nStudent question: {question}"
    return f"{SYSTEM_GENERAL}\n\nStudent question: {question}"


@router.post("/ask", response_model=AskResponse)
def ask(req: AskRequest, user: CurrentUser = Depends(get_current_user)):
    chunks = _retrieve(user.id, req.question)
    prompt = _build_prompt(req.question, chunks)
    grounded = bool(chunks)
    answer = generate_text(prompt) if grounded else generate_text_with_search(prompt)
    sources = [Source(document_id=c["document_id"], document_title=c["document_title"],
                      snippet=c["content"][:200]) for c in chunks]
    return AskResponse(answer=answer, sources=sources, mode="grounded" if grounded else "general")


@router.post("/stream")
def stream_ask(req: AskRequest, user: CurrentUser = Depends(get_current_user)):
    chunks  = _retrieve(user.id, req.question)
    prompt  = _build_prompt(req.question, chunks)
    grounded = bool(chunks)
    mode    = "grounded" if grounded else "general"
    sources = [{"document_id": c["document_id"], "document_title": c["document_title"],
                "snippet": c["content"][:200]} for c in chunks]
    stream_fn = generate_text_stream if grounded else generate_text_stream_with_search

    def event_stream():
        try:
            for chunk in stream_fn(prompt):
                yield f"data: {json.dumps({'type': 'text', 'text': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            return
        yield f"data: {json.dumps({'type': 'done', 'sources': sources, 'mode': mode})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
