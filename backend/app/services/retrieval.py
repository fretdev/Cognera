"""
Shared retrieval helper for flashcard/quiz generation: pulls chunks
belonging to the selected documents evenly across documents (so every selected
file is represented), and caps total length to stay within model windows.
"""
from app.db.supabase_client import get_supabase, call_supabase

MAX_CONTEXT_CHARS = 32_000  # ~8k tokens — plenty for flashcards & quizzes


def get_combined_context(user_id: str, document_ids: list[str]) -> str:
    if not document_ids:
        return ""

    # Fetch chunks per document evenly so multi-document selections get fair representation
    per_doc_limit = max(10, 50 // len(document_ids))
    all_chunks = []

    for doc_id in document_ids:
        res = call_supabase(
            lambda: get_supabase()
            .table("document_chunks")
            .select("document_id, content, chunk_index")
            .eq("user_id", user_id)
            .eq("document_id", doc_id)
            .order("chunk_index")
            .limit(per_doc_limit)
            .execute()
        )
        if res and res.data:
            all_chunks.extend(res.data)

    if not all_chunks:
        return ""

    combined = "\n\n".join(c["content"] for c in all_chunks)
    return combined[:MAX_CONTEXT_CHARS]
