"""
RAG chat: embed the question, retrieve the most relevant chunks the user
has uploaded, build a grounded prompt, and ask Gemini to answer using only
that context.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.auth import CurrentUser, get_current_user
from app.db.supabase_client import get_supabase
from app.services.gemini_client import embed_text, generate_text, to_pgvector_literal

router = APIRouter(prefix="/chat", tags=["chat"])


class AskRequest(BaseModel):
    question: str


class Source(BaseModel):
    document_id: str
    document_title: str
    snippet: str


class AskResponse(BaseModel):
    answer: str
    sources: list[Source]


@router.post("/ask", response_model=AskResponse)
def ask(req: AskRequest, user: CurrentUser = Depends(get_current_user)):
    supabase = get_supabase()

    question_embedding = embed_text(req.question)

    result = supabase.rpc(
        "match_document_chunks",
        {
            "query_embedding": to_pgvector_literal(question_embedding),
            "match_user_id": user.id,
            "match_count": 5,
        },
    ).execute()

    chunks = result.data or []

    if not chunks:
        return AskResponse(
            answer="I don't have any of your documents to draw from yet — upload a PDF first, then ask again.",
            sources=[],
        )

    context = "\n\n".join(
        f"[Source {i+1}: {c['document_title']}]\n{c['content']}"
        for i, c in enumerate(chunks)
    )

    prompt = f"""You are a study assistant answering a student's question using ONLY the
context below, drawn from their own course materials. If the context doesn't
contain the answer, say so plainly rather than guessing.

Context:
{context}

Question: {req.question}

Answer clearly and concisely. Where relevant, reference which source number
supports each part of your answer, like (Source 1)."""

    answer = generate_text(prompt)

    sources = [
        Source(
            document_id=c["document_id"],
            document_title=c["document_title"],
            snippet=c["content"][:200],
        )
        for c in chunks
    ]

    return AskResponse(answer=answer, sources=sources)
