"use client";

import { Code2, Mail, CalendarRange } from "lucide-react";

const QUICK_STARTS = [
  {
    label: "Analyze Code",
    prompt: "Help me understand and review this code snippet: ",
    icon: Code2,
  },
  {
    label: "Draft Email",
    prompt: "Help me draft an email to my professor about ",
    icon: Mail,
  },
  {
    label: "Study Plan",
    prompt: "Help me build a study plan for my upcoming exam on ",
    icon: CalendarRange,
  },
];

export default function WelcomeView({
  onQuickStart,
}: {
  onQuickStart: (prompt: string) => void;
}) {
  return (
    <div className="mt-16 text-center md:mt-24">
      <h1 className="gradient-text text-2xl font-medium md:text-3xl">
        Welcome to Cognera
      </h1>
      <p className="mt-3 text-sm text-muted">
        Ask anything about your course materials, or start with one of these.
      </p>

      <div
        role="group"
        aria-label="Quick start prompts"
        className="mx-auto mt-8 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {QUICK_STARTS.map(({ label, prompt, icon: Icon }) => (
          <button
            key={label}
            type="button"
            aria-label={`Quick start: ${label}`}
            onClick={() => onQuickStart(prompt)}
            className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:bg-bg"
          >
            <Icon size={21} strokeWidth={1.5} className="text-muted" />
            <span className="text-sm font-medium text-ink">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
