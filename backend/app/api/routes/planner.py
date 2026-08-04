"""
Study Planner REST API endpoints.
Provides complete CRUD operations on the `study_planner` table in Supabase.
All operations are authenticated and scoped to the current user's ID.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.auth import CurrentUser, get_current_user
from app.db.supabase_client import get_supabase, call_supabase

router = APIRouter(prefix="/planner", tags=["planner"])


class PlannerItemCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    category: str = Field(default="study_session", description="Category e.g. exam, assignment, study_session")
    target_timestamp: Optional[str] = None
    duration_minutes: int = Field(default=30, ge=1, le=1440)


class PlannerItemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    target_timestamp: Optional[str] = None
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    is_completed: Optional[bool] = None


@router.get("")
def list_planner_items(user: CurrentUser = Depends(get_current_user)):
    """List all study planner tasks, countdowns, and sessions for the current user."""
    result = call_supabase(
        lambda: get_supabase()
        .table("study_planner")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


@router.post("")
def create_planner_item(
    item: PlannerItemCreate, user: CurrentUser = Depends(get_current_user)
):
    """Create a new study task, exam countdown, or study session."""
    payload = {
        "user_id": user.id,
        "title": item.title.strip(),
        "description": item.description.strip() if item.description else None,
        "category": item.category.strip() if item.category else "study_session",
        "target_timestamp": item.target_timestamp,
        "duration_minutes": item.duration_minutes,
        "is_completed": False,
    }

    result = call_supabase(
        lambda: get_supabase()
        .table("study_planner")
        .insert(payload)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create study planner item.")
    return result.data[0]


@router.patch("/{item_id}")
def update_planner_item(
    item_id: str,
    item_update: PlannerItemUpdate,
    user: CurrentUser = Depends(get_current_user),
):
    """Update an existing study planner item (e.g. toggle completion or edit details)."""
    updates = {}
    if item_update.title is not None:
        updates["title"] = item_update.title.strip()
    if item_update.description is not None:
        updates["description"] = item_update.description.strip() if item_update.description else None
    if item_update.category is not None:
        updates["category"] = item_update.category.strip()
    if item_update.target_timestamp is not None:
        updates["target_timestamp"] = item_update.target_timestamp
    if item_update.duration_minutes is not None:
        updates["duration_minutes"] = item_update.duration_minutes
    if item_update.is_completed is not None:
        updates["is_completed"] = item_update.is_completed

    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided for update.")

    result = call_supabase(
        lambda: get_supabase()
        .table("study_planner")
        .update(updates)
        .eq("id", item_id)
        .eq("user_id", user.id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Planner item not found or unauthorized.")
    return result.data[0]


@router.delete("/{item_id}")
def delete_planner_item(
    item_id: str, user: CurrentUser = Depends(get_current_user)
):
    """Delete a study planner item."""
    result = call_supabase(
        lambda: get_supabase()
        .table("study_planner")
        .delete()
        .eq("id", item_id)
        .eq("user_id", user.id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Planner item not found or unauthorized.")
    return {"status": "deleted", "id": item_id}
