"""
Profile endpoints — student metadata management and live study analytics.

Display names, academic major, institution, and graduation goals are stored
in Supabase Auth user_metadata. Stats are aggregated live in parallel from
existing tables (documents, conversations, flashcards, quiz_questions, study_planner).
"""
import datetime
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import CurrentUser, get_current_user
from app.db.supabase_client import get_supabase, call_supabase

router = APIRouter(prefix="/profile", tags=["profile"])


class ProfileStats(BaseModel):
    documents: int = 0
    conversations: int = 0
    flashcards: int = 0
    quizzes: int = 0
    planner_total: int = 0
    planner_completed: int = 0
    upcoming_exams: int = 0
    activity_trend: list[int] = [0, 0, 0, 0, 0, 0, 0]


class ProfileResponse(BaseModel):
    email: str | None
    display_name: str | None
    major: str | None = None
    institution: str | None = None
    graduation_year: str | None = None
    study_goal: str | None = None
    stats: ProfileStats


class UpdateProfileRequest(BaseModel):
    display_name: str | None = None
    major: str | None = None
    institution: str | None = None
    graduation_year: str | None = None
    study_goal: str | None = None


@router.get("", response_model=ProfileResponse)
def get_profile(user: CurrentUser = Depends(get_current_user)):
    """Returns the user's profile credentials and live study statistics in parallel."""
    supabase = get_supabase()

    def fetch_user_meta():
        try:
            auth_user = supabase.auth.admin.get_user_by_id(user.id)
            if auth_user and auth_user.user:
                return auth_user.user.user_metadata or {}
        except Exception as e:
            print(f"Failed to fetch user metadata: {e}")
        return {}

    def count_rows(table: str, filter_col: str | None = None, filter_val: str | bool | None = None) -> int:
        try:
            def _query():
                query = supabase.table(table).select("id", count="exact").eq("user_id", user.id)
                if filter_col is not None and filter_val is not None:
                    query = query.eq(filter_col, filter_val)
                return query.execute()

            result = call_supabase(_query)
            return result.count or 0
        except Exception:
            return 0

    def compute_trend() -> list[int]:
        activity_trend = [0] * 7
        try:
            now = datetime.datetime.now(datetime.timezone.utc)
            seven_days_ago = now - datetime.timedelta(days=6)
            def _trend_query():
                return (
                    supabase.table("study_planner")
                    .select("created_at")
                    .eq("user_id", user.id)
                    .gte("created_at", seven_days_ago.isoformat())
                    .execute()
                )
            res = call_supabase(_trend_query)
            if res and res.data:
                for row in res.data:
                    created_str = row.get("created_at")
                    if created_str:
                        try:
                            dt = datetime.datetime.fromisoformat(created_str.replace("Z", "+00:00"))
                            delta_days = (now.date() - dt.date()).days
                            if 0 <= delta_days < 7:
                                activity_trend[6 - delta_days] += 1
                        except Exception:
                            pass
        except Exception as e:
            print(f"Failed to compute activity trend: {e}")
        return activity_trend

    # Run queries in parallel via ThreadPoolExecutor for fast response
    with ThreadPoolExecutor(max_workers=8) as executor:
        meta_future = executor.submit(fetch_user_meta)
        docs_future = executor.submit(count_rows, "documents")
        convs_future = executor.submit(count_rows, "conversations")
        cards_future = executor.submit(count_rows, "flashcards")
        quiz_future = executor.submit(count_rows, "quiz_questions")
        plan_tot_future = executor.submit(count_rows, "study_planner")
        plan_comp_future = executor.submit(count_rows, "study_planner", "is_completed", True)
        exams_future = executor.submit(count_rows, "study_planner", "category", "exam")
        trend_future = executor.submit(compute_trend)

        meta = meta_future.result()
        documents = docs_future.result()
        conversations = convs_future.result()
        flashcards = cards_future.result()
        quizzes = quiz_future.result()
        planner_total = plan_tot_future.result()
        planner_completed = plan_comp_future.result()
        upcoming_exams = exams_future.result()
        activity_trend = trend_future.result()

    stats = ProfileStats(
        documents=documents,
        conversations=conversations,
        flashcards=flashcards,
        quizzes=quizzes,
        planner_total=planner_total,
        planner_completed=planner_completed,
        upcoming_exams=upcoming_exams,
        activity_trend=activity_trend,
    )

    display_name = meta.get("display_name") or meta.get("full_name") or meta.get("name")

    return ProfileResponse(
        email=user.email,
        display_name=display_name,
        major=meta.get("major"),
        institution=meta.get("institution"),
        graduation_year=meta.get("graduation_year"),
        study_goal=meta.get("study_goal"),
        stats=stats,
    )


@router.patch("", response_model=ProfileResponse)
def update_profile(
    req: UpdateProfileRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Updates display name and academic credentials in Supabase Auth user_metadata."""
    supabase = get_supabase()

    # Retrieve current metadata
    auth_user = supabase.auth.admin.get_user_by_id(user.id)
    meta = (auth_user.user.user_metadata or {}) if (auth_user and auth_user.user) else {}

    if req.display_name is not None:
        name = req.display_name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Display name cannot be empty")
        if len(name) > 60:
            raise HTTPException(status_code=400, detail="Display name must be 60 characters or fewer")
        meta["display_name"] = name

    if req.major is not None:
        meta["major"] = req.major.strip()[:80]
    if req.institution is not None:
        meta["institution"] = req.institution.strip()[:100]
    if req.graduation_year is not None:
        meta["graduation_year"] = req.graduation_year.strip()[:10]
    if req.study_goal is not None:
        meta["study_goal"] = req.study_goal.strip()[:150]

    supabase.auth.admin.update_user_by_id(
        user.id,
        {"user_metadata": meta},
    )

    return get_profile(user)


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
