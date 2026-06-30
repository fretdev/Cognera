"""
Study planner endpoints — we'll build these out together next:
- CRUD on study_sessions (create/list/update/delete).
- Optional: POST /planner/generate — given deadlines + topics, ask Gemini
  to propose a session schedule, then save the suggested sessions.
"""
from fastapi import APIRouter

router = APIRouter(prefix="/planner", tags=["planner"])


@router.get("/ping")
def ping():
    return {"status": "planner router is wired up"}
