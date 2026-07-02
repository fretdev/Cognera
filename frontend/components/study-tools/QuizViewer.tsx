"use client";

import { useState } from "react";
import { Check, X, RotateCcw } from "lucide-react";

type QuizQuestion = { id: string; question: string; options: string[]; correct_option: number };

export default function QuizViewer({
  questions,
  onRetry,
}: {
  questions: QuizQuestion[];
  onRetry: () => void;
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [reviewingWrong, setReviewingWrong] = useState(false);

  function selectOption(qIndex: number, optionIndex: number) {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [qIndex]: optionIndex }));
  }

  const allAnswered = questions.every((_, i) => answers[i] !== undefined);
  const score = questions.reduce(
    (acc, q, i) => acc + (answers[i] === q.correct_option ? 1 : 0),
    0
  );
  const wrongIndexes = questions
    .map((q, i) => (answers[i] !== q.correct_option ? i : -1))
    .filter((i) => i !== -1);

  const displayQuestions =
    submitted && reviewingWrong
      ? questions.filter((_, i) => wrongIndexes.includes(i))
      : questions;

  const percentage = Math.round((score / questions.length) * 100);
  const passed = percentage >= 70;

  return (
    <div className="flex flex-col gap-5">
      {submitted && (
        <div className="rounded-2xl border border-border bg-surface px-5 py-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-medium text-ink">
                {score} / {questions.length} correct &nbsp;·&nbsp;
                <span className={passed ? "text-[#81c995]" : "text-[#f28b82]"}>
                  {percentage}%
                </span>
              </p>
              <p className="mt-1 text-xs text-muted">
                {passed
                  ? "Well done — solid understanding of this material."
                  : "Keep reviewing — try the wrong answers below."}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {wrongIndexes.length > 0 && (
              <button
                type="button"
                onClick={() => setReviewingWrong((r) => !r)}
                className="btn-primary text-xs"
              >
                {reviewingWrong
                  ? "Show all questions"
                  : `Review ${wrongIndexes.length} wrong answer${wrongIndexes.length > 1 ? "s" : ""}`}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setAnswers({});
                setSubmitted(false);
                setReviewingWrong(false);
              }}
              className="btn-primary text-xs"
            >
              <RotateCcw size={13} strokeWidth={1.75} className="mr-1.5" />
              Retake this quiz
            </button>
            <button
              type="button"
              onClick={onRetry}
              className="btn-primary text-xs"
            >
              Generate new quiz
            </button>
          </div>
        </div>
      )}

      {displayQuestions.map((q) => {
        // Always use the original index so correct_option references stay valid
        const originalIndex = questions.indexOf(q);
        const selected = answers[originalIndex];

        return (
          <div key={q.id} className="rounded-2xl border border-border bg-surface p-5">
            <p className="mb-3 text-sm font-medium text-ink">
              {originalIndex + 1}. {q.question}
            </p>
            <div className="flex flex-col gap-2">
              {q.options.map((option, optIndex) => {
                const isSelected = selected === optIndex;
                const isCorrect = optIndex === q.correct_option;

                let stateClasses = "border-border hover:bg-bg";
                if (submitted) {
                  if (isCorrect) stateClasses = "border-[#81c995] bg-[#81c995]/10";
                  else if (isSelected) stateClasses = "border-[#f28b82] bg-[#f28b82]/10";
                } else if (isSelected) {
                  stateClasses = "border-[#4285F4] bg-bg";
                }

                return (
                  <button
                    key={optIndex}
                    type="button"
                    onClick={() => selectOption(originalIndex, optIndex)}
                    disabled={submitted}
                    aria-label={`Option ${optIndex + 1}: ${option}`}
                    className={`flex items-center justify-between rounded-xl border px-4 py-2.5 text-left text-sm text-ink transition-colors ${stateClasses}`}
                  >
                    <span>{option}</span>
                    {submitted && isCorrect && <Check size={16} strokeWidth={2} className="flex-shrink-0 text-[#81c995]" />}
                    {submitted && isSelected && !isCorrect && <X size={16} strokeWidth={2} className="flex-shrink-0 text-[#f28b82]" />}
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
          className="btn-primary self-start"
        >
          Submit answers
        </button>
      )}
    </div>
  );
}
