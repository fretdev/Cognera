"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";

type QuizQuestion = {
  id: string;
  question: string;
  options: string[];
  correct_option: number;
};

export default function QuizViewer({ questions }: { questions: QuizQuestion[] }) {
  // null = unanswered. Keyed by question index so re-answering isn't allowed
  // once picked, matching how a real quiz should behave.
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  function selectOption(qIndex: number, optionIndex: number) {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [qIndex]: optionIndex }));
  }

  const allAnswered = questions.every((_, i) => answers[i] !== undefined);
  const score = questions.reduce(
    (acc, q, i) => acc + (answers[i] === q.correct_option ? 1 : 0),
    0
  );

  return (
    <div className="flex flex-col gap-6">
      {submitted && (
        <div className="rounded-2xl border border-border bg-surface px-5 py-4 text-center">
          <p className="text-lg font-medium text-ink">
            {score} / {questions.length} correct
          </p>
        </div>
      )}

      {questions.map((q, qIndex) => {
        const selected = answers[qIndex];
        return (
          <div
            key={q.id}
            className="rounded-2xl border border-border bg-surface p-5"
          >
            <p className="mb-3 text-sm font-medium text-ink">
              {qIndex + 1}. {q.question}
            </p>
            <div className="flex flex-col gap-2">
              {q.options.map((option, optIndex) => {
                const isSelected = selected === optIndex;
                const isCorrect = optIndex === q.correct_option;

                let stateClasses = "border-border hover:bg-bg";
                if (submitted) {
                  if (isCorrect) {
                    stateClasses = "border-[#81c995] bg-[#81c995]/10";
                  } else if (isSelected && !isCorrect) {
                    stateClasses = "border-[#f28b82] bg-[#f28b82]/10";
                  }
                } else if (isSelected) {
                  stateClasses = "border-[#4285F4] bg-bg";
                }

                return (
                  <button
                    key={optIndex}
                    type="button"
                    onClick={() => selectOption(qIndex, optIndex)}
                    disabled={submitted}
                    aria-label={`Option ${optIndex + 1}: ${option}`}
                    className={`flex items-center justify-between rounded-xl border px-4 py-2.5 text-left text-sm text-ink transition-colors ${stateClasses}`}
                  >
                    <span>{option}</span>
                    {submitted && isCorrect && (
                      <Check size={16} strokeWidth={2} className="text-[#81c995]" />
                    )}
                    {submitted && isSelected && !isCorrect && (
                      <X size={16} strokeWidth={2} className="text-[#f28b82]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {!submitted && (
        <button
          type="button"
          onClick={() => setSubmitted(true)}
          disabled={!allAnswered}
          className="gradient-bg self-start rounded-full px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Submit answers
        </button>
      )}
    </div>
  );
}
