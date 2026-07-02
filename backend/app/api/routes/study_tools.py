"""
Flashcard and quiz generation, built on the same retrieval pipeline as
chat: pull chunk content for the selected documents, prompt Gemini for
structured JSON, validate it, save it, return it.
"""
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import CurrentUser, get_current_user
from app.db.supabase_client import get_supabase, call_supabase
from app.services.gemini_client import generate_json
from app.services.retrieval import get_combined_context

router = APIRouter(prefix="/study-tools", tags=["study-tools"])

MAX_ITEMS = 25  # sanity ceiling regardless of what the user requests


# ---------------------------------------------------------------- Flashcards

class FlashcardRequest(BaseModel):
    document_ids: list[str]
    count: int = 10


class Flashcard(BaseModel):
    id: str
    question: str
    answer: str


@router.post("/flashcards", response_model=list[Flashcard])
def generate_flashcards(
    req: FlashcardRequest, user: CurrentUser = Depends(get_current_user)
):
    if not req.document_ids:
        raise HTTPException(status_code=400, detail="Select at least one document")

    count = max(1, min(req.count, MAX_ITEMS))
    context = get_combined_context(user.id, req.document_ids)

    if not context:
        raise HTTPException(
            status_code=400,
            detail="No content found for the selected documents",
        )

    prompt = f"""You are generating study flashcards from a student's course material.

Material:
{context}

Generate exactly {count} flashcards covering the most important concepts in
this material. Return ONLY a raw JSON array, no markdown formatting, no
commentary, in this exact shape:
[{{"question": "...", "answer": "..."}}]

Questions should test understanding, not just word-for-word recall. Answers
should be concise (1-3 sentences)."""

    raw = generate_json(prompt)

    try:
        items = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502, detail="The model returned an unexpected format. Try again."
        )

    
    rows = []
    flashcards = []
    primary_document_id = req.document_ids[0]

    for item in items[:count]:
        if "question" not in item or "answer" not in item:
            continue
        fc_id = str(uuid.uuid4())
        rows.append(
            {
                "id": fc_id,
                "document_id": primary_document_id,
                "user_id": user.id,
                "question": item["question"],
                "answer": item["answer"],
            }
        )
        flashcards.append(Flashcard(id=fc_id, question=item["question"], answer=item["answer"]))

    if rows:
        call_supabase(lambda: get_supabase().table("flashcards").insert(rows).execute())

    return flashcards


@router.get("/flashcards", response_model=list[Flashcard])
def list_flashcards(user: CurrentUser = Depends(get_current_user)):
    
    result = (
        supabase.table("flashcards")
        .select("id, question, answer")
        .eq("user_id", user.id)
        .order("created_at", desc=True)
        .execute()
    )
    return [Flashcard(**row) for row in result.data]


# --------------------------------------------------------------------- Quiz

class QuizRequest(BaseModel):
    document_ids: list[str]
    count: int = 5


class QuizQuestion(BaseModel):
    id: str
    question: str
    options: list[str]
    correct_option: int


@router.post("/quiz", response_model=list[QuizQuestion])
def generate_quiz(req: QuizRequest, user: CurrentUser = Depends(get_current_user)):
    if not req.document_ids:
        raise HTTPException(status_code=400, detail="Select at least one document")

    count = max(1, min(req.count, MAX_ITEMS))
    context = get_combined_context(user.id, req.document_ids)

    if not context:
        raise HTTPException(
            status_code=400,
            detail="No content found for the selected documents",
        )

    prompt = f"""You are generating a multiple-choice quiz from a student's course material.

Material:
{context}

Generate exactly {count} multiple-choice questions covering the most
important concepts in this material. Return ONLY a raw JSON array, no
markdown formatting, no commentary, in this exact shape:
[{{"question": "...", "options": ["...", "...", "...", "..."], "correct_option": 0}}]

Each question must have exactly 4 options. correct_option is the
zero-based index of the correct answer in the options array. Make
distractors plausible, not obviously wrong."""

    raw = generate_json(prompt)

    try:
        items = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502, detail="The model returned an unexpected format. Try again."
        )

    
    rows = []
    questions = []
    primary_document_id = req.document_ids[0]

    for item in items[:count]:
        if (
            "question" not in item
            or "options" not in item
            or "correct_option" not in item
            or len(item["options"]) != 4
            or not (0 <= item["correct_option"] <= 3)
        ):
            continue
        q_id = str(uuid.uuid4())
        rows.append(
            {
                "id": q_id,
                "document_id": primary_document_id,
                "user_id": user.id,
                "question": item["question"],
                "options": item["options"],
                "correct_option": item["correct_option"],
            }
        )
        questions.append(
            QuizQuestion(
                id=q_id,
                question=item["question"],
                options=item["options"],
                correct_option=item["correct_option"],
            )
        )

    if rows:
        call_supabase(lambda: get_supabase().table("quiz_questions").insert(rows).execute())

    return questions


@router.get("/quiz", response_model=list[QuizQuestion])
def list_quiz_questions(user: CurrentUser = Depends(get_current_user)):
    
    result = (
        supabase.table("quiz_questions")
        .select("id, question, options, correct_option")
        .eq("user_id", user.id)
        .order("created_at", desc=True)
        .execute()
    )
    return [QuizQuestion(**row) for row in result.data]
