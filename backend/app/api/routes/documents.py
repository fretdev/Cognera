import uuid
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from app.core.auth import CurrentUser, get_current_user
from app.db.supabase_client import get_supabase, call_supabase
from app.services.document_processor import chunk_text, extract_text
from app.services.gemini_client import embed_text, to_pgvector_literal

router   = APIRouter(prefix="/documents", tags=["documents"])
MAX_SIZE = 25 * 1024 * 1024  # 25 MB
BUCKET   = "documents"

ALLOWED_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
    "text/plain", "text/markdown", "text/csv", "text/x-markdown",
}
ALLOWED_EXT = {".pdf",".docx",".doc",".pptx",".ppt",".txt",".md",".csv",".markdown"}


@router.get("")
def list_documents(user: CurrentUser = Depends(get_current_user)):
    result = call_supabase(lambda: get_supabase()
        .table("documents")
        .select("id, title, summary, created_at, last_accessed_at")
        .eq("user_id", user.id)
        .order("created_at", desc=True)
        .execute())
    return result.data


# /upload MUST come before /{document_id} — FastAPI matches in definition order
@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
):
    filename = file.filename or "upload"
    ext      = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
    ct       = (file.content_type or "").lower()

    if ct not in ALLOWED_TYPES and ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400,
            detail=f"Unsupported file type. Supported: PDF, Word, PowerPoint, plain text, CSV, Markdown.")

    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds the 25 MB limit.")

    try:
        text = extract_text(data, ct, filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")

    if not text.strip():
        raise HTTPException(status_code=400,
            detail="No extractable text found. The file may be image-only or empty.")

    doc_id  = str(uuid.uuid4())
    storage = f"{user.id}/{doc_id}{ext or '.bin'}"

    # Store original file
    get_supabase().storage.from_(BUCKET).upload(
        storage, data,
        file_options={"content-type": ct or "application/octet-stream"},
    )

    # Insert document row (last_accessed_at defaults to now via DB default)
    call_supabase(lambda: get_supabase().table("documents").insert({
        "id": doc_id, "user_id": user.id,
        "title": filename, "storage_path": storage,
    }).execute())

    # Chunk → embed → store
    chunks = chunk_text(text)
    rows   = [
        {"document_id": doc_id, "user_id": user.id,
         "content": c, "chunk_index": i,
         "embedding": to_pgvector_literal(embed_text(c))}
        for i, c in enumerate(chunks)
    ]
    if rows:
        call_supabase(lambda: get_supabase()
            .table("document_chunks").insert(rows).execute())

    return {"document_id": doc_id, "title": filename, "chunks_created": len(rows)}


@router.delete("/{document_id}")
def delete_document(document_id: str, user: CurrentUser = Depends(get_current_user)):
    res = call_supabase(lambda: get_supabase()
        .table("documents").select("storage_path")
        .eq("id", document_id).eq("user_id", user.id).execute())
    if not res.data:
        raise HTTPException(status_code=404, detail="Document not found")
    try:
        get_supabase().storage.from_(BUCKET).remove([res.data[0]["storage_path"]])
    except Exception:
        pass
    call_supabase(lambda: get_supabase().table("documents")
        .delete().eq("id", document_id).eq("user_id", user.id).execute())
    return {"deleted": document_id}
