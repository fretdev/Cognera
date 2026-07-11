"""
Profile endpoints — user stats, display name management.

Display names are stored in Supabase Auth user_metadata so we don't need
an extra DB table. Stats are aggregated live from existing tables.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import CurrentUser, get_current_user
from app.db.supabase_client import get_supabase, call_supabase

router = APIRouter(prefix="/profile", tags=["profile"])


class ProfileResponse(BaseModel):
    email: str | None
    display_name: str | None
    stats: dict


class UpdateProfileRequest(BaseModel):
    display_name: str


@router.get("", response_model=ProfileResponse)
def get_profile(user: CurrentUser = Depends(get_current_user)):
    """Returns the user's profile info and live study stats."""
    supabase = get_supabase()

    # Fetch user metadata for display name
    auth_user = supabase.auth.admin.get_user_by_id(user.id)
    display_name = None
    if auth_user and auth_user.user:
        display_name = (auth_user.user.user_metadata or {}).get("display_name")

    # Live stats — each is a simple count query
    def count(table: str) -> int:
        try:
            result = call_supabase(
                lambda: supabase.table(table)
                .select("id", count="exact")
                .eq("user_id", user.id)
                .execute()
            )
            return result.count or 0
        except Exception:
            return 0

    stats = {
        "documents":    count("documents"),
        "conversations": count("conversations"),
        "flashcards":   count("flashcards"),
        "quizzes":      count("quiz_questions"),
    }

    return ProfileResponse(
        email=user.email,
        display_name=display_name,
        stats=stats,
    )


@router.patch("")
def update_profile(
    req: UpdateProfileRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Updates the display name stored in Supabase Auth user_metadata."""
    name = req.display_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Display name cannot be empty")
    if len(name) > 60:
        raise HTTPException(status_code=400, detail="Display name must be 60 characters or fewer")

    supabase = get_supabase()
    supabase.auth.admin.update_user_by_id(
        user.id,
        {"user_metadata": {"display_name": name}},
    )
    return {"display_name": name}


@router.delete("/conversations")
def clear_conversations(user: CurrentUser = Depends(get_current_user)):
    """Deletes all of a user's conversations (and their messages via cascade)."""
    call_supabase(
        lambda: get_supabase()
        .table("conversations")
        .delete()
        .eq("user_id", user.id)
        .execute()
    )
    return {"cleared": True}
