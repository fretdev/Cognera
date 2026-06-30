"use client";

import { useState } from "react";
import { apiPost } from "@/lib/api";
import DocumentPicker from "./DocumentPicker";
import FlashcardViewer from "./FlashcardViewer";
import QuizViewer from "./QuizViewer";

type Flashcard = { id: string; question: string; answer: string };
type QuizQuestion = {
  id: string;
  question: string;
  options: string[];
  correct_option: number;
};
type Tab = "flashcards" | "quiz";

export default function StudyToolsPanel() {
  const [tab, setTab] = useState<Tab>("flashcards");
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [count, setCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [flashcards, setFlashcards] = useState<Flashcard[] | null>(null);
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null);

  async function handleGenerate() {
    if (selectedDocs.length === 0) {
      setError("Select at least one document first");
      return;
    }
    setError("");
    setLoading(true);
    setFlashcards(null);
    setQuiz(null);

    try {
      if (tab === "flashcards") {
        const cards = await apiPost<Flashcard[]>("/study-tools/flashcards", {
          document_ids: selectedDocs,
          count,
        });
        setFlashcards(cards);
      } else {
        const questions = await apiPost<QuizQuestion[]>("/study-tools/quiz", {
          document_ids: selectedDocs,
          count,
        });
        setQuiz(questions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  function switchTab(next: Tab) {
    setTab(next);
    setFlashcards(null);
    setQuiz(null);
    setError("");
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-medium text-ink">Flashcards & Quizzes</h1>
      <p className="mt-2 text-sm text-muted">
        Generated from whatever you've uploaded — pick the documents and how
        many items you want.
      </p>

      <div
        role="tablist"
        className="mt-6 inline-flex rounded-full border border-border bg-surface p-1"
      >
        {(["flashcards", "quiz"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => switchTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
              tab === t ? "bg-bg text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {t === "flashcards" ? "Flashcards" : "Quiz"}
          </button>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <DocumentPicker
          selected={selectedDocs}
          onChange={setSelectedDocs}
          count={count}
          onCountChange={setCount}
          countLabel={tab === "flashcards" ? "NUMBER OF FLASHCARDS" : "NUMBER OF QUESTIONS"}
        />

        {error && <p className="mt-3 text-sm text-[#f28b82]">{error}</p>}

        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="gradient-bg mt-5 w-full rounded-full py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading
            ? "Generating…"
            : tab === "flashcards"
              ? "Generate flashcards"
              : "Generate quiz"}
        </button>
      </div>

      {flashcards && flashcards.length > 0 && (
        <div className="mt-8">
          <FlashcardViewer cards={flashcards} />
        </div>
      )}

      {quiz && quiz.length > 0 && (
        <div className="mt-8">
          <QuizViewer questions={quiz} />
        </div>
      )}
    </div>
  );
}
