"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { BookOpen, Layers, CalendarClock, Upload, MessageSquare, Trophy, ArrowRight, Github } from "lucide-react";
import { CogneraWordmark } from "@/components/brand/CogneraLogo";

/* ── Gradient orb background ──────────────────────────────────────────── */
function GradientOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full bg-[#4285F4] opacity-[0.08] blur-[120px]" />
      <div className="absolute -right-40 top-1/4 h-[500px] w-[500px] rounded-full bg-[#9B72CB] opacity-[0.07] blur-[120px]" />
      <div className="absolute bottom-0 left-1/3 h-[400px] w-[400px] rounded-full bg-[#D96570] opacity-[0.06] blur-[120px]" />
    </div>
  );
}

/* ── Interactive 3D product preview ──────────────────────────────────── */
function ProductPreview() {
  const [tilt, setTilt] = useState({ x: 3, y: -5 });
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const rx = ((e.clientY - cy) / rect.height) * 10;
    const ry = -((e.clientX - cx) / rect.width) * 12;
    setTilt({ x: rx, y: ry });
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTilt({ x: 3, y: -5 })}
      className="relative mx-auto w-full max-w-lg preview-float"
      style={{
        perspective: "1200px",
        transform: `perspective(1200px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transition: "transform 0.08s linear",
      }}
    >
      {/* Glow behind the card */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#4285F4] via-[#9B72CB] to-[#D96570] opacity-20 blur-2xl" />

      {/* The mock interface */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#1a1b1c] shadow-2xl">
        {/* Top bar */}
        <div className="flex items-center gap-2 border-b border-white/5 bg-[#131314] px-4 py-3">
          <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          <div className="ml-3 flex-1 rounded-md bg-white/5 px-3 py-1 text-center text-[10px] text-white/30">
            cognera.app
          </div>
        </div>

        {/* App layout preview */}
        <div className="flex h-64">
          {/* Mini sidebar */}
          <div className="flex w-36 flex-col gap-1 border-r border-white/5 bg-[#131314] p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <div className="h-4 w-4 rounded bg-gradient-to-br from-[#4285F4] to-[#9B72CB]" />
              <span className="text-[9px] font-semibold text-white/60">Cognera</span>
            </div>
            {["New chat", "Documents", "Flashcards", "Planner"].map((item, i) => (
              <div
                key={item}
                className={`rounded-full px-2 py-1 text-[9px] ${i === 0 ? "bg-white/8 text-white/80" : "text-white/30"}`}
              >
                {item}
              </div>
            ))}
            <div className="mt-3 border-t border-white/5 pt-2">
              <div className="mb-1 text-[8px] text-white/20">Today</div>
              {["Data Structures Q&A", "Physics Exam Prep", "Math Notes"].map((c) => (
                <div key={c} className="truncate rounded px-1.5 py-0.5 text-[8px] text-white/25">
                  {c}
                </div>
              ))}
            </div>
          </div>

          {/* Chat area */}
          <div className="flex flex-1 flex-col">
            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-hidden p-4">
              <div className="flex justify-end">
                <div className="max-w-[70%] rounded-2xl bg-white/8 px-3 py-1.5 text-[9px] text-white/70">
                  Explain binary search trees
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[9px] leading-relaxed text-white/50">
                  A Binary Search Tree (BST) is a data structure where each node has at most two children. The left child contains values{" "}
                  <span className="text-[#4285F4]">less than</span> the parent, and the right child contains values{" "}
                  <span className="text-[#9B72CB]">greater than</span> the parent.
                </div>
                <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-white/10 bg-[#4285F4]/10 px-2 py-0.5 text-[8px] text-[#4285F4]">
                  📄 Source Grounded · DSA Notes.pdf
                </div>
              </div>
            </div>

            {/* Input */}
            <div className="border-t border-white/5 p-3">
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/4 px-3 py-1.5">
                <span className="flex-1 text-[9px] text-white/25">Ask anything about your materials…</span>
                <div className="h-4 w-4 rounded-full bg-white/10" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Feature card ─────────────────────────────────────────────────────── */
function FeatureCard({
  icon: Icon,
  title,
  description,
  color,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  color: string;
}) {
  return (
    <div className="glass-card group p-6 transition-transform duration-300 hover:-translate-y-1">
      <div
        className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl"
        style={{ background: `${color}18`, border: `1px solid ${color}30` }}
      >
        <Icon size={20} style={{ color }} strokeWidth={1.75} />
      </div>
      <h3 className="mb-2 font-semibold text-ink">{title}</h3>
      <p className="text-sm leading-relaxed text-muted">{description}</p>
    </div>
  );
}

/* ── Step ─────────────────────────────────────────────────────────────── */
function Step({ n, title, description }: { n: number; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-[#4285F4]/30 bg-[#4285F4]/10 text-sm font-semibold text-[#4285F4]">
        {n}
      </div>
      <div>
        <h4 className="font-semibold text-ink">{title}</h4>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
    </div>
  );
}

/* ── Main landing page ────────────────────────────────────────────────── */
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-bg text-ink">
      <GradientOrbs />

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled ? "border-b border-border bg-bg/80 backdrop-blur-xl" : ""
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <CogneraWordmark iconSize={24} />
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-muted transition-colors hover:text-ink">
              Sign in
            </Link>
            <Link
              href="/login"
              className="btn-primary text-sm"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6 pt-20 text-center">
        <div className="reveal-up mb-4 inline-flex items-center gap-2 rounded-full border border-[#4285F4]/30 bg-[#4285F4]/8 px-4 py-1.5 text-xs text-[#4285F4]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4285F4]" />
          Built for university students
        </div>

        <h1
          className="reveal-up reveal-up-delay-1 mx-auto max-w-4xl font-bold leading-[1.1] tracking-tight"
          style={{ fontSize: "clamp(2.5rem, 5vw + 1rem, 5rem)" }}
        >
          Study smarter with{" "}
          <span className="gradient-text">AI that knows</span>
          <br />
          your materials
        </h1>

        <p
          className="reveal-up reveal-up-delay-2 mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted"
        >
          Upload your lecture notes, textbooks, and slides. Cognera turns them into an intelligent study companion — answering questions, generating flashcards, and building quiz sets, all grounded in your own course material.
        </p>

        <div className="reveal-up reveal-up-delay-3 mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="group flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#131314] transition-all hover:bg-white/90"
          >
            Start studying free
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#how-it-works"
            className="flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-medium text-muted transition-colors hover:border-white/30 hover:text-ink"
          >
            See how it works
          </a>
        </div>

        <div className="reveal-up reveal-up-delay-4 mt-20 w-full max-w-2xl px-4">
          <ProductPreview />
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce text-muted">
          <div className="h-6 w-3.5 rounded-full border border-border p-0.5">
            <div className="h-1.5 w-1 rounded-full bg-muted mx-auto" />
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <section className="relative px-6 py-28">
        <div className="mx-auto max-w-6xl">
          <div className="mb-14 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-ink">
              Everything you need to{" "}
              <span className="gradient-text">ace your exams</span>
            </h2>
            <p className="mt-4 text-muted">
              One tool. All your study needs.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FeatureCard
              icon={MessageSquare}
              title="Source-grounded chat"
              description="Ask any question about your uploaded materials and get answers that cite the exact section of your notes they came from."
              color="#4285F4"
            />
            <FeatureCard
              icon={Layers}
              title="Flashcards & quizzes"
              description="Automatically generate flashcards and multiple-choice quizzes from your documents. Study actively, not passively."
              color="#9B72CB"
            />
            <FeatureCard
              icon={CalendarClock}
              title="Study planner"
              description="Tell Cognera your exam dates and it helps you build a structured revision schedule around your own materials."
              color="#D96570"
            />
            <FeatureCard
              icon={BookOpen}
              title="General assistant"
              description="No document? No problem. Ask Cognera to explain concepts, debug code, or brainstorm ideas — it's a full study companion."
              color="#34A853"
            />
            <FeatureCard
              icon={Upload}
              title="Any PDF, instantly"
              description="Upload lecture slides, textbook chapters, or research papers. Cognera extracts and indexes the content in seconds."
              color="#FBBC04"
            />
            <FeatureCard
              icon={Trophy}
              title="Built for results"
              description="Students who use active recall and spaced repetition score higher. Cognera bakes both into every study session."
              color="#EA4335"
            />
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section id="how-it-works" className="relative px-6 py-24">
        <div className="mx-auto max-w-4xl">
          <div className="grid grid-cols-1 gap-16 md:grid-cols-2 md:gap-12 md:items-center">
            <div>
              <p className="mb-3 text-sm font-medium text-[#4285F4]">How it works</p>
              <h2 className="mb-10 text-3xl font-bold tracking-tight text-ink">
                From upload to exam-ready in minutes
              </h2>
              <div className="flex flex-col gap-7">
                <Step
                  n={1}
                  title="Upload your materials"
                  description="Drop in your lecture slides, textbook PDFs, or any course document. Cognera processes and indexes them instantly."
                />
                <Step
                  n={2}
                  title="Ask anything"
                  description="Type your question naturally. Cognera finds the relevant sections of your notes and answers with full citation."
                />
                <Step
                  n={3}
                  title="Generate study tools"
                  description="Turn your notes into flashcards, quizzes, and summaries with one click — ready to use for active revision."
                />
              </div>
            </div>

            <div className="glass-card overflow-hidden p-6">
              <div className="space-y-3">
                {[
                  { q: "What is Big O notation?", from: "DSA Lecture 3.pdf" },
                  { q: "Summarise Chapter 4 thermodynamics", from: "Physics Notes.pdf" },
                  { q: "Generate 10 flashcards from my marketing notes", from: "Marketing Week 5.pdf" },
                ].map((item, i) => (
                  <div key={i} className="rounded-xl border border-border bg-bg p-3">
                    <p className="text-sm text-ink">{item.q}</p>
                    <p className="mt-1 text-xs text-muted">📄 {item.from}</p>
                  </div>
                ))}
                <div className="pt-1 text-center text-xs text-muted">
                  Answers grounded in your materials
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────── */}
      <section className="relative px-6 py-28 text-center">
        <div className="mx-auto max-w-2xl">
          <div className="glass-card p-12">
            <h2 className="mb-4 text-3xl font-bold tracking-tight text-ink">
              Ready to study smarter?
            </h2>
            <p className="mb-8 text-muted">
              Join students already using Cognera to get more from their study time. Free to get started.
            </p>
            <Link
              href="/login"
              className="group inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-[#131314] transition-all hover:bg-white/90"
            >
              Create your free account
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-border px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <CogneraWordmark iconSize={20} />
          <p className="text-xs text-muted">
            Built for students. Powered by Gemini.
          </p>
        </div>
      </footer>
    </div>
  );
}
