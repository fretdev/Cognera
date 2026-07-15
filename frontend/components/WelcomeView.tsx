"use client";

import {
  BookOpen, Layers, Code2, Lightbulb, Brain, FileText,
} from "lucide-react";

const QUICK_STARTS = [
  {
    label: "What does my document cover?",
    prompt: "Give me a structured overview of everything covered in my uploaded documents — main topics, key concepts, and important details.",
    icon: FileText,
    category: "study",
  },
  {
    label: "Generate flashcards",
    prompt: "Generate 10 flashcards from the most important concepts in my uploaded documents.",
    icon: Layers,
    category: "study",
  },
  {
    label: "Explain a concept",
    prompt: "Explain the most important concept from my documents in simple terms with examples.",
    icon: Brain,
    category: "study",
  },
  {
    label: "Debug my code",
    prompt: "Help me debug this code and explain what's wrong:\n\n",
    icon: Code2,
    category: "general",
  },
  {
    label: "Brainstorm ideas",
    prompt: "Help me brainstorm ideas for ",
    icon: Lightbulb,
    category: "general",
  },
  {
    label: "Study plan",
    prompt: "Help me build a structured study plan for my exam on ",
    icon: BookOpen,
    category: "general",
  },
];

export default function WelcomeView({
  onQuickStart,
}: {
  onQuickStart: (prompt: string) => void;
}) {
  return (
    <div style={{ marginTop: "60px", textAlign: "center" }}>
      <h1
        className="gradient-text"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(1.6rem, 3vw + 0.5rem, 2.4rem)",
          fontWeight: 700,
          letterSpacing: "-0.03em",
          lineHeight: 1.15,
          marginBottom: "12px",
        }}
      >
        Welcome to Cognera
      </h1>
      <p style={{ fontSize: "14.5px", color: "var(--t2)", marginBottom: "40px" }}>
        Upload your documents and ask anything — or start with one of these.
      </p>

      {/* Study tasks */}
      <div style={{ textAlign: "left" }}>
        <p style={{
          fontSize: "11px", fontWeight: 600, letterSpacing: "0.07em",
          textTransform: "uppercase", color: "var(--t3)", marginBottom: "10px",
        }}>
          From your documents
        </p>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "8px",
          marginBottom: "24px",
        }}>
          {QUICK_STARTS.filter(q => q.category === "study").map(({ label, prompt, icon: Icon }) => (
            <button
              key={label}
              type="button"
              aria-label={`Quick start: ${label}`}
              onClick={() => onQuickStart(prompt)}
              style={{
                display: "flex", alignItems: "center", gap: "10px",
                background: "var(--s1)", border: "1px solid var(--b1)",
                borderRadius: "12px", padding: "12px 14px",
                textAlign: "left", cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--b2)";
                (e.currentTarget as HTMLElement).style.background = "var(--s2)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--b1)";
                (e.currentTarget as HTMLElement).style.background = "var(--s1)";
              }}
            >
              <Icon size={15} strokeWidth={1.75} style={{ color: "var(--accent)", flexShrink: 0 }} />
              <span style={{ fontSize: "13.5px", color: "var(--t1)", lineHeight: 1.4 }}>{label}</span>
            </button>
          ))}
        </div>

        {/* General tasks */}
        <p style={{
          fontSize: "11px", fontWeight: 600, letterSpacing: "0.07em",
          textTransform: "uppercase", color: "var(--t3)", marginBottom: "10px",
        }}>
          General tasks
        </p>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "8px",
        }}>
          {QUICK_STARTS.filter(q => q.category === "general").map(({ label, prompt, icon: Icon }) => (
            <button
              key={label}
              type="button"
              aria-label={`Quick start: ${label}`}
              onClick={() => onQuickStart(prompt)}
              style={{
                display: "flex", alignItems: "center", gap: "10px",
                background: "var(--s1)", border: "1px solid var(--b1)",
                borderRadius: "12px", padding: "12px 14px",
                textAlign: "left", cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--b2)";
                (e.currentTarget as HTMLElement).style.background = "var(--s2)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--b1)";
                (e.currentTarget as HTMLElement).style.background = "var(--s1)";
              }}
            >
              <Icon size={15} strokeWidth={1.75} style={{ color: "var(--t3)", flexShrink: 0 }} />
              <span style={{ fontSize: "13.5px", color: "var(--t1)", lineHeight: 1.4 }}>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
