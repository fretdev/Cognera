"""
Context-aware RAG chat with connection-resilient Supabase calls.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.auth import CurrentUser, get_current_user
from app.db.supabase_client import get_supabase, call_supabase
from app.services.gemini_client import embed_text, generate_text, to_pgvector_literal

router = APIRouter(prefix="/chat", tags=["chat"])

SIMILARITY_THRESHOLD = 0.55
CONTEXT_CHUNKS = 5

SYSTEM_GROUNDED = """You are Cognera, a professional AI study assistant.
You have been provided with excerpts from the student's own course materials.

Rules:
- Answer using the provided source material as your primary reference.
- After answering from the sources, you MAY briefly add relevant general
  knowledge that enriches the answer — clearly signpost it with
  "Beyond your materials:".
- Always cite which source number supports each claim, e.g. (Source 1).
- If the provided material does not contain the answer, say so plainly and
  offer a general explanation instead.
- Keep a clear, academic, and concise tone — no filler phrases."""

SYSTEM_GENERAL = """You are Cognera, a professional AI study companion.
No document context has been provided for this session.

You are a knowledgeable, helpful assistant that can:
- Explain concepts clearly across any academic subject
- Help debug and review code
- Assist with brainstorming and structuring ideas
- Answer general knowledge questions

Rules:
- Be concise and precise — students value clarity over length.
- When answering technical questions, prefer examples.
- Maintain a professional, academic tone consistent with Cognera's brand."""


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


@router.post("/ask", response_model=AskResponse)
def ask(req: AskRequest, user: CurrentUser = Depends(get_current_user)):
    question_embedding = embed_text(req.question)

    result = call_supabase(lambda: get_supabase().rpc(
        "match_document_chunks",
        {
            "query_embedding": to_pgvector_literal(question_embedding),
            "match_user_id": user.id,
            "match_count": CONTEXT_CHUNKS,
        },
    ).execute())

    chunks = result.data or []
    relevant_chunks = [c for c in chunks if (c.get("similarity") or 0) >= SIMILARITY_THRESHOLD]
    grounded = len(relevant_chunks) > 0

    if grounded:
        context_block = "\n\n".join(
            f"[Source {i+1}: {c['document_title']}]\n{c['content']}"
            for i, c in enumerate(relevant_chunks)
        )
        prompt = f"""{SYSTEM_GROUNDED}

---
{context_block}
---

Student's question: {req.question}"""
    else:
        prompt = f"""{SYSTEM_GENERAL}

Student's question: {req.question}"""

    answer = generate_text(prompt)

    sources = (
        [
            Source(
                document_id=c["document_id"],
                document_title=c["document_title"],
                snippet=c["content"][:200],
            )
            for c in relevant_chunks
        ]
        if grounded
        else []
    )

    return AskResponse(
        answer=answer,
        sources=sources,
        mode="grounded" if grounded else "general",
    )
