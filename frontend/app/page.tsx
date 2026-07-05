"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { CogneraWordmark, CogneraMark } from "@/components/brand/CogneraLogo";

/* ── Navigation ────────────────────────────────────────────────────────── */
function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 flex items-center justify-between px-6 py-4 md:px-10"
      style={{ background: "linear-gradient(to bottom, var(--bg) 60%, transparent)" }}>
      <CogneraWordmark size={22} />
      <nav className="flex items-center gap-1">
        <Link href="/login" className="px-4 py-2 text-sm rounded-full transition-colors"
          style={{ color: "var(--text-2)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--text-1)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--text-2)")}>
          Sign in
        </Link>
        <Link href="/login" className="btn-cta text-sm">
          Get started
        </Link>
      </nav>
    </header>
  );
}

/* ── Chat demo — real content, not a UI skeleton ───────────────────────── */
function ChatDemo() {
  const messages = [
    {
      role: "user",
      content: "What's the difference between supervised and unsupervised learning?",
    },
    {
      role: "ai",
      content: "In **supervised learning**, the model trains on labeled data — each input has a known correct output. Examples include classification (spam vs. not spam) and regression (predicting a price).\n\nIn **unsupervised learning**, there are no labels. The model finds patterns in the data itself — clustering similar items or reducing dimensionality. K-means and PCA are classic examples.",
      source: "ML Lecture Notes — Week 3.pdf",
    },
    {
      role: "user",
      content: "Give me 3 flashcards on this",
    },
    {
      role: "ai",
      content: "**Card 1**\nQ: What makes a learning algorithm 'supervised'?\nA: Training on labeled input-output pairs.\n\n**Card 2**\nQ: Name two supervised learning task types\nA: Classification and regression.\n\n**Card 3**\nQ: What does k-means clustering do?\nA: Groups similar unlabeled data points without prior categories.",
      source: "ML Lecture Notes — Week 3.pdf",
    },
  ];

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-1)",
        boxShadow: "0 40px 80px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset",
      }}
    >
      {/* Window chrome */}
      <div className="flex items-center gap-3 px-5 py-3.5"
        style={{ borderBottom: "1px solid var(--border-1)", background: "var(--bg)" }}>
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#FF5F56" }} />
          <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#FFBD2E" }} />
          <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#27C93F" }} />
        </div>
        <div className="flex-1 mx-3 text-center text-xs rounded-md px-3 py-1"
          style={{ background: "var(--surface-1)", color: "var(--text-3)" }}>
          cognera.app/chat
        </div>
      </div>

      {/* Messages */}
      <div className="p-6 space-y-5">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "ai" && (
              <div className="mr-2.5 mt-0.5 flex-shrink-0">
                <CogneraMark size={18} />
              </div>
            )}
            <div className="max-w-[82%]">
              <div
                className="rounded-2xl px-4 py-3 text-sm leading-relaxed"
                style={m.role === "user"
                  ? { background: "var(--surface-3)", color: "var(--text-1)", borderBottomRightRadius: "6px" }
                  : { color: "var(--text-1)" }
                }
              >
                {m.content.split("\n").map((line, li) => {
                  const bold = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
                  return (
                    <p key={li} className={li > 0 ? "mt-2" : ""}>
                      <span dangerouslySetInnerHTML={{ __html: bold }} />
                    </p>
                  );
                })}
              </div>
              {m.source && (
                <div className="mt-2 flex items-center gap-1.5 text-xs"
                  style={{ color: "var(--text-3)" }}>
                  <div className="h-1 w-1 rounded-full" style={{ background: "var(--accent)" }} />
                  {m.source}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="px-5 pb-5">
        <div className="flex items-center gap-3 rounded-xl px-4 py-3"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border-2)" }}>
          <span className="flex-1 text-sm" style={{ color: "var(--text-3)" }}>
            Ask a question about your notes…
          </span>
          <div className="h-6 w-6 rounded-full flex items-center justify-center"
            style={{ background: "var(--surface-3)" }}>
            <ArrowRight size={11} color="var(--text-3)" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Feature row ────────────────────────────────────────────────────────── */
function Feature({ title, description }: { title: string; description: string }) {
  return (
    <div className="py-7 card-hover rounded-xl px-5 -mx-5 transition-all"
      style={{ border: "1px solid transparent" }}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 h-4 w-4 rounded-full flex items-center justify-center"
          style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border)" }}>
          <Check size={9} color="var(--accent)" strokeWidth={2.5} />
        </div>
        <div>
          <p className="font-medium mb-1 text-sm" style={{ color: "var(--text-1)", fontFamily: "var(--font-display)" }}>
            {title}
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Main ───────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <Nav />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-20 px-6 md:px-10">
        <div className="mx-auto max-w-6xl">

          {/* Label */}
          <div className="fade-up mb-8 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs"
            style={{ borderColor: "var(--border-2)", color: "var(--text-3)" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
            AI-powered studying, grounded in your course material
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-12 items-start">
            {/* Left: copy */}
            <div>
              <h1 className="fade-up delay-100 t-hero mb-6">
                The AI that{" "}
                <span style={{ color: "var(--accent)" }}>reads your</span>
                {" "}notes
              </h1>
              <p className="fade-up delay-200 t-lead mb-10 max-w-lg">
                Upload your lecture slides, textbooks, and past papers. Cognera answers your questions from your own materials — not the internet.
              </p>
              <div className="fade-up delay-300 flex items-center flex-wrap gap-3">
                <Link href="/login" className="btn-cta">
                  Start for free
                  <ArrowRight size={14} strokeWidth={2.5} />
                </Link>
                <Link href="#how" className="btn-ghost">
                  See how it works
                </Link>
              </div>
              <p className="fade-up delay-400 mt-5 text-xs" style={{ color: "var(--text-3)" }}>
                No credit card required
              </p>

              {/* Social proof numbers */}
              <div className="fade-up delay-500 mt-12 flex gap-8">
                {[
                  { n: "PDFs", label: "Any format" },
                  { n: "Instant", label: "Processing" },
                  { n: "Cited", label: "Every answer" },
                ].map(({ n, label }) => (
                  <div key={label}>
                    <p className="font-display font-700 text-xl mb-0.5" style={{ color: "var(--text-1)", fontFamily: "var(--font-display)", fontWeight: 700 }}>{n}</p>
                    <p className="text-xs" style={{ color: "var(--text-3)" }}>{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: demo */}
            <div className="fade-up delay-200 lg:mt-2">
              <ChatDemo />
            </div>
          </div>
        </div>
      </section>

      <hr className="section-divider" />

      {/* ── What Cognera does ─────────────────────────────────────────── */}
      <section id="how" className="py-24 px-6 md:px-10">
        <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          <div>
            <p className="t-label mb-4">What it does</p>
            <h2 className="t-h1 mb-5">Built around how students actually study</h2>
            <p className="t-body mb-10">
              Most AI tools answer from the internet. Cognera answers from your materials — the same way a tutor who read your lecture notes would.
            </p>
            <div style={{ borderTop: "1px solid var(--border-1)" }}>
              <Feature
                title="Source-grounded answers"
                description="Every response cites the exact section of your notes it came from. No hallucinations, no generic internet content."
              />
              <div style={{ borderTop: "1px solid var(--border-1)" }} />
              <Feature
                title="Instant flashcards and quizzes"
                description="Turn any uploaded document into active revision materials in seconds. Select multiple documents and choose how many items to generate."
              />
              <div style={{ borderTop: "1px solid var(--border-1)" }} />
              <Feature
                title="Full conversation history"
                description="Every chat is saved. Come back to your thermodynamics session the night before your exam exactly where you left it."
              />
              <div style={{ borderTop: "1px solid var(--border-1)" }} />
              <Feature
                title="General assistant when you need it"
                description="No document uploaded? Cognera switches to general knowledge mode — debug your code, brainstorm essay arguments, or clarify any concept."
              />
            </div>
          </div>

          {/* Right: steps */}
          <div className="space-y-2">
            {[
              {
                step: "01",
                title: "Upload your materials",
                body: "Drop in a PDF — lecture slides, textbook chapters, past papers. Cognera extracts the text, splits it into sections, and builds a searchable index in seconds.",
              },
              {
                step: "02",
                title: "Ask in plain language",
                body: "Type your question exactly as you'd ask a friend who studied the same course. Cognera finds the relevant sections and constructs an answer from them.",
              },
              {
                step: "03",
                title: "Revise actively",
                body: "Generate flashcards and quizzes directly from your notes. Active recall beats re-reading by 2× for long-term retention.",
              },
            ].map(({ step, title, body }) => (
              <div key={step}
                className="rounded-xl p-6 transition-colors"
                style={{ background: "var(--surface-1)", border: "1px solid var(--border-1)" }}>
                <div className="flex items-start gap-5">
                  <span className="text-xs font-mono mt-0.5 flex-shrink-0" style={{ color: "var(--accent)", letterSpacing: "0.05em" }}>
                    {step}
                  </span>
                  <div>
                    <h3 className="font-semibold mb-2 text-sm" style={{ fontFamily: "var(--font-display)", color: "var(--text-1)" }}>
                      {title}
                    </h3>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>{body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className="section-divider" />

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="py-28 px-6 text-center">
        <div className="mx-auto max-w-xl">
          <h2 className="t-h1 mb-4">Start studying with Cognera</h2>
          <p className="t-body mb-10">
            Upload your first document in under a minute. No configuration, no setup — just your notes and your questions.
          </p>
          <Link href="/login" className="btn-cta inline-flex">
            Create a free account
            <ArrowRight size={14} strokeWidth={2.5} />
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer style={{ borderTop: "1px solid var(--border-1)" }}>
        <div className="mx-auto max-w-6xl px-6 md:px-10 py-8 flex items-center justify-between">
          <CogneraWordmark size={20} />
          <p className="text-xs" style={{ color: "var(--text-3)" }}>
            Powered by Gemini · Built for students everywhere
          </p>
        </div>
      </footer>
    </div>
  );
}
