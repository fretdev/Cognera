"use client";

import { BookOpen, Layers, Code2, Lightbulb, Brain, FileText } from "lucide-react";

const QUICK_STARTS = [
  {
    label: "Summarize Document",
    prompt: "Summarize the key points from my uploaded document.",
    icon: FileText,
    category: "study",
  },
  {
    label: "Generate Flashcards",
    prompt: "Generate 10 flashcards from my course material to help me study.",
    icon: Layers,
    category: "study",
  },
  {
    label: "Explain Concepts",
    prompt: "Explain this concept clearly with examples: ",
    icon: Brain,
    category: "study",
  },
  {
    label: "Debug My Code",
    prompt: "Help me debug this code and explain what's wrong: ",
    icon: Code2,
    category: "general",
  },
  {
    label: "Brainstorm Ideas",
    prompt: "Help me brainstorm ideas for ",
    icon: Lightbulb,
    category: "general",
  },
  {
    label: "Study Plan",
    prompt: "Help me build a structured study plan for my exam on ",
    icon: BookOpen,
    category: "general",
  },
];

export default function WelcomeView({ onQuickStart }: { onQuickStart: (prompt: string) => void }) {
  return (
    <div className="mt-16 md:mt-24">
      <h1 className="gradient-text text-center text-2xl font-medium md:text-3xl">
        Welcome to Cognera
      </h1>
      <p className="mt-3 text-center text-sm text-muted">
        Upload documents to get grounded answers from your course materials, or
        ask anything as a general study companion.
      </p>

      <div className="mt-10">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
          Study Tasks
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {QUICK_STARTS.filter((q) => q.category === "study").map(({ label, prompt, icon: Icon }) => (
            <button
              key={label}
              type="button"
              aria-label={`Quick start: ${label}`}
              onClick={() => onQuickStart(prompt)}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left text-sm text-ink transition-colors hover:bg-bg"
            >
              <Icon size={16} strokeWidth={1.5} className="flex-shrink-0 text-muted" />
              {label}
            </button>
          ))}
        </div>

        <p className="mb-3 mt-6 text-xs font-medium uppercase tracking-wide text-muted">
          General Tasks
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {QUICK_STARTS.filter((q) => q.category === "general").map(({ label, prompt, icon: Icon }) => (
            <button
              key={label}
              type="button"
              aria-label={`Quick start: ${label}`}
              onClick={() => onQuickStart(prompt)}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left text-sm text-ink transition-colors hover:bg-bg"
            >
              <Icon size={16} strokeWidth={1.5} className="flex-shrink-0 text-muted" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
