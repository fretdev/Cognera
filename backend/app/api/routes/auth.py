from fastapi import APIRouter, Depends

from app.core.auth import CurrentUser, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
def me(user: CurrentUser = Depends(get_current_user)):
    """Confirms the backend can verify the token the frontend sent and
    identify which user it belongs to. Every future protected route will
    use the same `Depends(get_current_user)` pattern."""
    return {"user_id": user.id, "email": user.email}
