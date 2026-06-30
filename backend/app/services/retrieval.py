"""
Shared retrieval helper for flashcard/quiz generation: pulls all chunks
belonging to the selected documents (ordered, so context reads naturally),
and caps total length so we don't blow past Gemini's context window or
generate an enormous bill on a huge multi-document selection.
"""
from app.db.supabase_client import get_supabase

MAX_CONTEXT_CHARS = 24_000  # ~6k tokens — plenty for 5-15 generated items


def get_combined_context(user_id: str, document_ids: list[str]) -> str:
    supabase = get_supabase()

    result = (
        supabase.table("document_chunks")
        .select("document_id, content, chunk_index")
        .eq("user_id", user_id)
        .in_("document_id", document_ids)
        .order("chunk_index")
        .execute()
    )

    chunks = result.data or []
    if not chunks:
        return ""

    combined = "\n\n".join(c["content"] for c in chunks)
    return combined[:MAX_CONTEXT_CHARS]
