from fastapi import APIRouter, HTTPException

from app.services.gemini_client import generate_text
from app.db.supabase_client import get_supabase

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
def health():
    return {"status": "ok"}


@router.get("/supabase")
def health_supabase():
    """Confirms the backend can reach Supabase with the configured credentials."""
    try:
        get_supabase().table("documents").select("id").limit(1).execute()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Supabase check failed: {e}")


@router.get("/gemini")
def health_gemini():
    """Confirms the backend can reach Gemini with the configured API key."""
    try:
        text = generate_text("Reply with exactly one word: pong")
        return {"status": "ok", "response": text.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini check failed: {e}")
