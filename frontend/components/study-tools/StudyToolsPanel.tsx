"use client";

import { useState } from "react";
import { apiPost } from "@/lib/api";
import DocumentPicker from "./DocumentPicker";
import FlashcardViewer from "./FlashcardViewer";
import QuizViewer from "./QuizViewer";

type Flashcard = { id: string; question: string; answer: string };
type QuizQuestion = { id: string; question: string; options: string[]; correct_option: number };
type Tab = "flashcards" | "quiz";

function getInitialState() {
  return { flashcards: null as Flashcard[] | null, quiz: null as QuizQuestion[] | null };
}

export default function StudyToolsPanel() {
  const [tab, setTab] = useState<Tab>("flashcards");
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [count, setCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [{ flashcards, quiz }, setResults] = useState(getInitialState());

  function resetResults() {
    setResults(getInitialState());
    setError("");
  }

  function switchTab(next: Tab) {
    setTab(next);
    resetResults();
  }

  async function handleGenerate() {
    if (selectedDocs.length === 0) {
      setError("Select at least one document first");
      return;
    }
    // Always clear previous results + error before a new request,
    // so stale data never misleads the user and loading state is clean.
    resetResults();
    setLoading(true);

    try {
      if (tab === "flashcards") {
        const cards = await apiPost<Flashcard[]>("/study-tools/flashcards", {
          document_ids: selectedDocs,
          count: Math.max(1, Math.min(count, 25)),
        });
        setResults({ flashcards: cards, quiz: null });
      } else {
        const questions = await apiPost<QuizQuestion[]>("/study-tools/quiz", {
          document_ids: selectedDocs,
          count: Math.max(1, Math.min(count, 25)),
        });
        setResults({ flashcards: null, quiz: questions });
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Generation failed — please try again"
      );
    } finally {
      // Always flip loading off, even on error, so the button is usable again.
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-medium text-ink">Flashcards & Quizzes</h1>
      <p className="mt-2 text-sm text-muted">
        Auto-generated from your uploaded materials — pick documents, set a
        count, and generate.
      </p>

      <div role="tablist" className="mt-6 inline-flex rounded-full border border-border bg-surface p-1">
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
          disabled={loading || selectedDocs.length === 0}
          className="btn-primary mt-5 w-full"
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
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-medium text-ink">{flashcards.length} cards generated</p>
            <button type="button" onClick={handleGenerate} className="btn-primary text-xs">
              Regenerate
            </button>
          </div>
          <FlashcardViewer cards={flashcards} />
        </div>
      )}

      {quiz && quiz.length > 0 && (
        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-medium text-ink">{quiz.length} questions generated</p>
          </div>
          <QuizViewer questions={quiz} onRetry={handleGenerate} />
        </div>
      )}
    </div>
  );
}
