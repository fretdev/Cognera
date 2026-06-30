"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, RotateCw } from "lucide-react";

type Flashcard = { id: string; question: string; answer: string };

export default function FlashcardViewer({ cards }: { cards: Flashcard[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const card = cards[index];

  function go(delta: number) {
    setFlipped(false);
    setIndex((i) => Math.max(0, Math.min(cards.length - 1, i + delta)));
  }

  if (!card) return null;

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Show question" : "Show answer"}
        className="flex min-h-[220px] w-full max-w-lg flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface px-8 py-10 text-center transition-colors hover:bg-bg"
      >
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          {flipped ? "Answer" : "Question"}
        </span>
        <p className="text-base text-ink">{flipped ? card.answer : card.question}</p>
        <span className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <RotateCw size={12} strokeWidth={1.75} />
          Click to flip
        </span>
      </button>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index === 0}
          aria-label="Previous card"
          className="rounded-full border border-border p-2 text-muted transition-colors hover:text-ink disabled:opacity-30"
        >
          <ChevronLeft size={18} strokeWidth={1.75} />
        </button>
        <span className="text-sm text-muted">
          {index + 1} / {cards.length}
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={index === cards.length - 1}
          aria-label="Next card"
          className="rounded-full border border-border p-2 text-muted transition-colors hover:text-ink disabled:opacity-30"
        >
          <ChevronRight size={18} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
