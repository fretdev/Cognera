"""
Document upload + the full ingestion pipeline:
upload PDF -> store original in Supabase Storage -> extract text ->
chunk -> embed each chunk -> save chunks+embeddings to document_chunks.

This is the backbone the chat (RAG), summarization, and quiz/flashcard
features all build on top of.
"""
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.core.auth import CurrentUser, get_current_user
from app.db.supabase_client import get_supabase
from app.services.document_processor import chunk_text, extract_text
from app.services.gemini_client import embed_text, to_pgvector_literal

router = APIRouter(prefix="/documents", tags=["documents"])

MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  # 20MB — matches the Storage bucket limit
STORAGE_BUCKET = "documents"


@router.get("")
def list_documents(user: CurrentUser = Depends(get_current_user)):
    """List the current user's uploaded documents, newest first."""
    supabase = get_supabase()
    result = (
        supabase.table("documents")
        .select("id, title, summary, created_at")
        .eq("user_id", user.id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    pdf_bytes = await file.read()

    if len(pdf_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds the 20MB limit")

    try:
        text = extract_text(pdf_bytes)
    except Exception:
        raise HTTPException(
            status_code=400, detail="Could not read this file as a PDF"
        )

    if not text.strip():
        raise HTTPException(
            status_code=400,
            detail="No extractable text found — this PDF may be scanned/image-only",
        )

    supabase = get_supabase()
    document_id = str(uuid.uuid4())
    storage_path = f"{user.id}/{document_id}.pdf"

    # 1. Store the original file
    supabase.storage.from_(STORAGE_BUCKET).upload(
        storage_path,
        pdf_bytes,
        file_options={"content-type": "application/pdf"},
    )

    # 2. Create the document row
    supabase.table("documents").insert(
        {
            "id": document_id,
            "user_id": user.id,
            "title": file.filename or "Untitled document",
            "storage_path": storage_path,
        }
    ).execute()

    # 3. Chunk, embed, and store each chunk
    chunks = chunk_text(text)
    rows = [
        {
            "document_id": document_id,
            "user_id": user.id,
            "content": chunk,
            "chunk_index": i,
            "embedding": to_pgvector_literal(embed_text(chunk)),
        }
        for i, chunk in enumerate(chunks)
    ]

    if rows:
        supabase.table("document_chunks").insert(rows).execute()

    return {
        "document_id": document_id,
        "title": file.filename,
        "chunks_created": len(rows),
    }
