"""
Context-aware RAG chat — streaming and one-shot.

Root cause of "can't access documents" bug (now fixed):
  1. query_embedding was passed as a formatted string "[0.1,0.2,...]" to
     the Supabase RPC. PostgREST's vector cast silently failed, returning
     zero chunks. Fix: pass as a plain Python list — Supabase serialises
     this as a JSON array which Postgres reliably casts via float[]::vector
     in the updated match_document_chunks SQL function.

  2. SIMILARITY_THRESHOLD was 0.42. Meta-questions like "summarise my
     document" have low cosine similarity to content chunks (~0.25-0.35)
     because they're about the document, not from it. Fix: threshold
     lowered to 0.20 so these queries get grounded context.

  3. When retrieval returned nothing, the system silently fell back to
     web search mode which says "I can't access your files." Fix: added
     a document-count check that gives a clear, honest message instead.
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
)

router = APIRouter(prefix="/chat", tags=["chat"])

SIMILARITY_THRESHOLD = 0.20   # low enough to catch meta/summary questions
CONTEXT_CHUNKS       = 10     # more context = better summaries

SYSTEM_GROUNDED = """You are Cognera, a precise AI study assistant.
The student's own course materials are provided below as numbered sources.

Rules:
- Answer ONLY from the provided sources unless explicitly asked otherwise.
- For summarisation: produce a clear, well-structured summary using
  headings and bullet points covering all key themes in the sources.
- Cite source numbers inline: (Source 1), (Source 2), etc.
- If the sources only partially answer the question, say so clearly,
  then add "Beyond your materials:" for any supplementary knowledge.
- Use markdown formatting — headings, bullets, bold key terms.
- Be concise and precise. You are a tutor, not a search engine."""

SYSTEM_GENERAL = """You are Cognera, an intelligent AI study companion.
No matching content was found in the student's uploaded documents for this
question. Answering from general knowledge with web search assistance.

Rules:
- Be precise and clear. Use examples when explaining concepts.
- Structure answers with headings and bullets where appropriate.
- For code questions: provide working examples with explanations.
- Never claim you cannot access files — you simply didn't find a match
  for this specific question in the uploaded material."""

SYSTEM_NO_DOCS = """You are Cognera, a friendly AI study assistant.
This student has not uploaded any documents yet (or documents are still
being processed).

Tell them warmly and clearly:
- They can upload study materials using the + button in the chat input
  or via the Documents page in the sidebar.
- Supported formats: PDF, Word (.docx), PowerPoint (.pptx), plain text,
  CSV, and Markdown.
- Once uploaded, Cognera will be able to answer questions, summarise
  content, and generate flashcards and quizzes from their materials.
- While they have no documents, Cognera can still help with general
  study questions, code help, and brainstorming."""


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


def _count_user_documents(user_id: str) -> int:
    """Return how many documents the user has uploaded."""
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


def _retrieve(user_id: str, question: str) -> list[dict]:
    """
    Embed the question and search ALL of the user's document chunks.

    Critical: embedding is passed as a plain Python list[float], NOT as
    a formatted string. Supabase serialises a Python list as a JSON array
    which Postgres reliably casts to vector via the float[] parameter in
    match_document_chunks. The old string format caused silent cast
    failures at the PostgREST layer.
    """
    embedding = embed_text(question)  # list[float], 768 dimensions

    result = call_supabase(lambda: get_supabase().rpc(
        "match_document_chunks",
        {
            "query_embedding": embedding,  # plain list — NOT to_pgvector_literal()
            "match_user_id":   user_id,
            "match_count":     CONTEXT_CHUNKS,
        },
    ).execute())

    chunks   = result.data or []
    relevant = [c for c in chunks if (c.get("similarity") or 0) >= SIMILARITY_THRESHOLD]

    # Bump last_accessed_at on matched documents for storage lifecycle
    if relevant:
        doc_ids = list({c["document_id"] for c in relevant})
        try:
            call_supabase(lambda: get_supabase()
                .table("documents")
                .update({"last_accessed_at": "now()"})
                .in_("id", doc_ids)
                .eq("user_id", user_id)
                .execute())
        except Exception:
            pass

    return relevant


def _build_prompt_and_mode(
    question: str,
    chunks: list,
    doc_count: int,
) -> tuple[str, str]:
    """Return (prompt, mode). Mode is 'grounded', 'general', or 'no_docs'."""

    if chunks:
        context = "\n\n".join(
            f"[Source {i+1}: {c['document_title']} "
            f"(relevance {c.get('similarity', 0):.2f})]\n{c['content']}"
            for i, c in enumerate(chunks)
        )
        prompt = (
            f"{SYSTEM_GROUNDED}\n\n"
            f"---\n{context}\n---\n\n"
            f"Student question: {question}"
        )
        return prompt, "grounded"

    if doc_count == 0:
        # No documents at all — guide user to upload
        return f"{SYSTEM_NO_DOCS}\n\nStudent message: {question}", "no_docs"

    # Has documents but nothing matched this question
    # Fall through to general + web search
    prompt = (
        f"{SYSTEM_GENERAL}\n\n"
        f"The student has {doc_count} uploaded document(s) but no relevant "
        f"sections matched this specific question.\n\n"
        f"Student question: {question}"
    )
    return prompt, "general"


@router.post("/ask", response_model=AskResponse)
def ask(req: AskRequest, user: CurrentUser = Depends(get_current_user)):
    chunks    = _retrieve(user.id, req.question)
    doc_count = 0 if chunks else _count_user_documents(user.id)
    prompt, mode = _build_prompt_and_mode(req.question, chunks, doc_count)

    if mode == "general":
        answer = generate_text_with_search(prompt)
    else:
        answer = generate_text(prompt)

    sources = [
        Source(
            document_id=c["document_id"],
            document_title=c["document_title"],
            snippet=c["content"][:200],
        )
        for c in chunks
    ]
    return AskResponse(answer=answer, sources=sources, mode=mode)


@router.post("/stream")
def stream_ask(req: AskRequest, user: CurrentUser = Depends(get_current_user)):
    chunks    = _retrieve(user.id, req.question)
    doc_count = 0 if chunks else _count_user_documents(user.id)
    prompt, mode = _build_prompt_and_mode(req.question, chunks, doc_count)

    sources = [
        {
            "document_id":    c["document_id"],
            "document_title": c["document_title"],
            "snippet":        c["content"][:200],
        }
        for c in chunks
    ]

    stream_fn = generate_text_stream_with_search if mode == "general" else generate_text_stream

    def event_stream():
        try:
            for text_chunk in stream_fn(prompt):
                yield f"data: {json.dumps({'type': 'text', 'text': text_chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            return
        yield f"data: {json.dumps({'type': 'done', 'sources': sources, 'mode': mode})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
