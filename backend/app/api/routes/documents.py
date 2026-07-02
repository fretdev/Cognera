import uuid
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from app.core.auth import CurrentUser, get_current_user
from app.db.supabase_client import get_supabase, call_supabase
from app.services.document_processor import chunk_text, extract_text
from app.services.gemini_client import embed_text, to_pgvector_literal

router = APIRouter(prefix="/documents", tags=["documents"])
MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024
STORAGE_BUCKET = "documents"


@router.get("")
def list_documents(user: CurrentUser = Depends(get_current_user)):
    result = call_supabase(lambda: get_supabase()
        .table("documents")
        .select("id, title, summary, created_at")
        .eq("user_id", user.id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.delete("/{document_id}")
def delete_document(
    document_id: str, user: CurrentUser = Depends(get_current_user)
):
    """Delete a document, its storage file, all its chunks, and any
    flashcards/quiz questions derived from it (cascade handles the DB side)."""
    # Fetch the storage path first so we can remove the file from Storage.
    result = call_supabase(
        lambda: get_supabase()
        .table("documents")
        .select("storage_path")
        .eq("id", document_id)
        .eq("user_id", user.id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found")

    storage_path = result.data[0]["storage_path"]

    # Remove the PDF file from Storage (best-effort — don't fail the whole
    # request if the file is already gone).
    try:
        get_supabase().storage.from_(STORAGE_BUCKET).remove([storage_path])
    except Exception:
        pass

    # Delete the DB row — cascades to document_chunks, flashcards,
    # quiz_questions via the foreign key ON DELETE CASCADE.
    call_supabase(
        lambda: get_supabase()
        .table("documents")
        .delete()
        .eq("id", document_id)
        .eq("user_id", user.id)
        .execute()
    )

    return {"deleted": document_id}

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
        raise HTTPException(status_code=400, detail="Could not read this file as a PDF")

    if not text.strip():
        raise HTTPException(
            status_code=400,
            detail="No extractable text found — this PDF may be scanned/image-only",
        )

    document_id = str(uuid.uuid4())
    storage_path = f"{user.id}/{document_id}.pdf"

    get_supabase().storage.from_(STORAGE_BUCKET).upload(
        storage_path,
        pdf_bytes,
        file_options={"content-type": "application/pdf"},
    )

    call_supabase(lambda: get_supabase().table("documents").insert({
        "id": document_id,
        "user_id": user.id,
        "title": file.filename or "Untitled document",
        "storage_path": storage_path,
    }).execute())

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
        call_supabase(lambda: get_supabase().table("document_chunks").insert(rows).execute())

    return {
        "document_id": document_id,
        "title": file.filename,
        "chunks_created": len(rows),
    }
