"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { ArrowRight, Check, Upload, MessageSquare, Layers, CalendarClock, BookOpen, Github, Twitter, Mail } from "lucide-react";
import { CogneraWordmark, CogneraMark } from "@/components/brand/CogneraLogo";
import ThemeToggle from "@/components/ThemeToggle";

/* ── Reusable section wrapper ──────────────────────────────────────────── */
function Section({ children, className = "", id = "" }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`px-5 md:px-10 ${className}`}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

/* ── Navigation ────────────────────────────────────────────────────────── */
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 transition-all duration-300"
      style={{ background: scrolled ? "var(--s1)" : "transparent", borderBottom: scrolled ? "1px solid var(--b1)" : "1px solid transparent" }}>
      <div className="mx-auto max-w-6xl flex items-center justify-between px-5 md:px-10 py-4">
        <CogneraWordmark size={22} />
        <div className="flex items-center gap-3">
          <div className="hidden sm:block"><ThemeToggle /></div>
          <Link href="/login" className="t-small transition-colors" style={{ color: "var(--t2)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--t1)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--t2)")}>Sign in</Link>
          <Link href="/login" className="btn-cta" style={{ padding: "8px 18px", fontSize: "13px" }}>Get started</Link>
        </div>
      </div>
    </header>
  );
}

/* ── Chat demo with real-looking exchange ──────────────────────────────── */
function ChatDemo() {
  const msgs = [
    { role: "user", text: "Explain the krebs cycle from my biochem notes" },
    { role: "ai", text: "The Krebs cycle (citric acid cycle) is an 8-step metabolic pathway in the mitochondrial matrix. Starting with acetyl-CoA combining with oxaloacetate to form citrate, each turn produces **3 NADH, 1 FADH₂, 1 GTP, and releases 2 CO₂**.\n\nKey enzymes include isocitrate dehydrogenase and α-ketoglutarate dehydrogenase — both allosterically inhibited by NADH, acting as a feedback brake.", source: "BIOL301 — Lecture 7.pdf" },
    { role: "user", text: "Make me 3 flashcards on this" },
    { role: "ai", text: "**Card 1** — What is the net ATP yield per Krebs cycle turn?\n→ Not directly — it yields 1 GTP, but NADH/FADH₂ feed into oxidative phosphorylation.\n\n**Card 2** — What molecule enters the Krebs cycle?\n→ Acetyl-CoA (2-carbon) combines with oxaloacetate (4-carbon).\n\n**Card 3** — Name two allosteric inhibitors of Krebs cycle enzymes.\n→ NADH inhibits isocitrate dehydrogenase and α-ketoglutarate dehydrogenase.", source: "BIOL301 — Lecture 7.pdf" },
  ];

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: "var(--s1)", border: "1px solid var(--b2)", boxShadow: "0 32px 64px -12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04) inset" }}>
      {/* Chrome */}
      <div className="flex items-center gap-3 px-5 py-3" style={{ background: "var(--bg)", borderBottom: "1px solid var(--b1)" }}>
        <div className="flex gap-1.5">
          {["#FF5F57","#FFBD2E","#28C840"].map(c => <div key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />)}
        </div>
        <div className="flex-1 mx-4 text-center rounded-md px-3 py-1 text-xs" style={{ background: "var(--s2)", color: "var(--t3)" }}>cognera.app/chat</div>
      </div>
      {/* Messages */}
      <div className="p-5 space-y-5">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "gap-2.5"}`}>
            {m.role === "ai" && <div className="flex-shrink-0 mt-0.5"><CogneraMark size={16} /></div>}
            <div className="max-w-[85%]">
              <div className="text-xs leading-relaxed" style={{ color: m.role === "user" ? "var(--t1)" : "var(--t1)" }}>
                {m.role === "user" ? (
                  <div className="rounded-2xl rounded-tr-md px-3.5 py-2.5 text-xs" style={{ background: "var(--s3)" }}>{m.text}</div>
                ) : (
                  <div>
                    {m.text.split("\n").map((line, li) => (
                      <p key={li} className={li ? "mt-2" : ""}
                        dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/→/g, '<span style="color:var(--accent)">→</span>') }} />
                    ))}
                  </div>
                )}
              </div>
              {m.role === "ai" && m.source && (
                <div className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: "var(--t3)" }}>
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
        <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-xs" style={{ background: "var(--s2)", border: "1px solid var(--b1)", color: "var(--t3)" }}>
          <span className="flex-1">Ask anything about your materials…</span>
          <div className="h-6 w-6 rounded-full flex items-center justify-center" style={{ background: "var(--accent)" }}>
            <ArrowRight size={11} color="#fff" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Stat pill ──────────────────────────────────────────────────────────── */
function Stat({ label, sub }: { label: string; sub: string }) {
  return (
    <div>
      <p className="font-display font-bold text-xl" style={{ fontFamily: "var(--font-display)", fontWeight: 800, letterSpacing: "-0.03em", color: "var(--t1)" }}>{label}</p>
      <p className="text-xs mt-0.5" style={{ color: "var(--t3)" }}>{sub}</p>
    </div>
  );
}

/* ── Feature card ────────────────────────────────────────────────────────  */
function FCard({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body: string }) {
  return (
    <div className="feature-card">
      <div className="mb-4 h-8 w-8 flex items-center justify-center rounded-lg"
        style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-border)" }}>
        <Icon size={16} style={{ color: "var(--accent)" }} strokeWidth={1.75} />
      </div>
      <h3 className="mb-2 text-sm font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--t1)" }}>{title}</h3>
      <p className="text-sm leading-relaxed" style={{ color: "var(--t2)" }}>{body}</p>
    </div>
  );
}

/* ── Comparison row ─────────────────────────────────────────────────────── */
function CmpRow({ label, cognera, generic }: { label: string; cognera: boolean; generic: boolean }) {
  return (
    <tr style={{ borderTop: "1px solid var(--b1)" }}>
      <td className="py-3 text-sm" style={{ color: "var(--t2)", paddingRight: "24px" }}>{label}</td>
      <td className="py-3 text-center">
        {cognera ? <span className="text-sm font-medium" style={{ color: "var(--accent)" }}>✓</span> : <span style={{ color: "var(--t3)" }}>—</span>}
      </td>
      <td className="py-3 text-center">
        {generic ? <span className="text-sm" style={{ color: "var(--t3)" }}>✓</span> : <span style={{ color: "var(--t3)" }}>—</span>}
      </td>
    </tr>
  );
}

/* ── Footer ─────────────────────────────────────────────────────────────── */
function Footer() {
  const cols = [
    { heading: "Product", links: [{ label: "Chat", href: "/chat" }, { label: "Documents", href: "/documents" }, { label: "Flashcards", href: "/study-tools" }, { label: "Planner", href: "/planner" }] },
    { heading: "Resources", links: [{ label: "Get started", href: "/login" }, { label: "How it works", href: "#how" }, { label: "For students", href: "#compare" }, { label: "Sign up free", href: "/login" }] },
    { heading: "Project", links: [{ label: "About Cognera", href: "#" }, { label: "Built with Next.js", href: "https://nextjs.org" }, { label: "Supabase backend", href: "https://supabase.com" }, { label: "AI by Google", href: "https://ai.google.dev" }] },
  ];

  return (
    <footer style={{ borderTop: "1px solid var(--b1)", background: "var(--s1)", backgroundImage: "none" }}>
      <div className="mx-auto max-w-6xl px-5 md:px-10">
        {/* Top */}
        <div className="py-14 grid grid-cols-1 md:grid-cols-5 gap-10">
          <div className="md:col-span-2">
            <CogneraWordmark size={24} />
            <p className="mt-4 text-sm leading-relaxed max-w-xs" style={{ color: "var(--t3)" }}>
              An AI study companion built for university students. Upload your course materials and get grounded, cited answers — not generic internet content.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <a href="https://github.com" aria-label="GitHub"
                className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
                style={{ background: "var(--s3)", color: "var(--t2)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--t1)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--t2)")}>
                <Github size={15} strokeWidth={1.75} />
              </a>
              <a href="https://twitter.com" aria-label="Twitter"
                className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
                style={{ background: "var(--s3)", color: "var(--t2)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--t1)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--t2)")}>
                <Twitter size={15} strokeWidth={1.75} />
              </a>
              <a href="mailto:hello@cognera.app" aria-label="Email"
                className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
                style={{ background: "var(--s3)", color: "var(--t2)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--t1)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--t2)")}>
                <Mail size={15} strokeWidth={1.75} />
              </a>
            </div>
          </div>
          {cols.map(col => (
            <div key={col.heading}>
              <p className="t-label mb-4">{col.heading}</p>
              <ul className="space-y-2.5">
                {col.links.map(l => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-sm transition-colors"
                      style={{ color: "var(--t3)" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "var(--t1)")}
                      onMouseLeave={e => (e.currentTarget.style.color = "var(--t3)")}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {/* Bottom */}
        <div className="py-5 flex flex-col sm:flex-row items-center justify-between gap-3" style={{ borderTop: "1px solid var(--b1)" }}>
          <p className="text-xs" style={{ color: "var(--t3)" }}>
            © {new Date().getFullYear()} Cognera. A final-year project built for students worldwide.
          </p>
          <div className="flex items-center gap-4">
            {["Privacy", "Terms", "Contact"].map(l => (
              <Link key={l} href="#" className="text-xs transition-colors" style={{ color: "var(--t3)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--t2)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--t3)")}>
                {l}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <Nav />

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <Section className="pt-32 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-10 items-start">
          <div>
            <div className="fade-up mb-7 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs"
              style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-border)", color: "var(--accent)" }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
              Built for university students · Free to use
            </div>
            <h1 className="fade-up delay-1 t-hero mb-5">
              The AI tutor<br />
              <span style={{ color: "var(--accent)" }}>that read</span><br />
              your notes
            </h1>
            <p className="fade-up delay-2 t-lead mb-8 max-w-md">
              Upload your lecture slides and textbooks. Cognera answers your questions from your own materials — not the internet — and cites exactly where it found each answer.
            </p>
            <div className="fade-up delay-3 flex flex-wrap gap-3 items-center mb-10">
              <Link href="/login" className="btn-cta">
                Start for free <ArrowRight size={14} strokeWidth={2.5} />
              </Link>
              <Link href="#how" className="btn-ghost">How it works</Link>
            </div>
            <div className="fade-up delay-4 flex gap-10">
              <Stat label="Any PDF" sub="Upload instantly" />
              <Stat label="Cited" sub="Every answer" />
              <Stat label="Active" sub="Recall built in" />
            </div>
          </div>
          <div className="fade-up delay-2"><ChatDemo /></div>
        </div>
      </Section>

      <hr className="section-rule" />

      {/* ── FEATURES ──────────────────────────────────────────────────── */}
      <Section className="py-24">
        <div className="mb-12 text-center">
          <p className="t-label mb-3">Everything you need</p>
          <h2 className="t-h1">One tool for your entire semester</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FCard icon={MessageSquare} title="Grounded chat" body="Ask any question. Get answers sourced directly from your lecture notes and textbooks, with citations." />
          <FCard icon={Layers} title="Flashcards & quizzes" body="Auto-generate active revision materials from any document. Multiple-choice, short-answer, spaced repetition." />
          <FCard icon={CalendarClock} title="Study planner" body="Set exam dates, pick topics, and get a personalised revision schedule built around your uploaded materials." />
          <FCard icon={BookOpen} title="General assistant" body="No document? Ask Cognera to explain concepts, debug code, or brainstorm ideas as a general study companion." />
        </div>
      </Section>

      <hr className="section-rule" />

      {/* ── HOW IT WORKS ──────────────────────────────────────────────── */}
      <Section id="how" className="py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="t-label mb-4">How it works</p>
            <h2 className="t-h1 mb-10">From upload to exam-ready in under a minute</h2>
            <div className="space-y-6">
              {[
                { n: "01", t: "Upload your materials", b: "Drop in any PDF — lecture slides, textbook chapters, past papers. Cognera extracts the text and builds a searchable vector index." },
                { n: "02", t: "Ask in plain language", b: "Type your question naturally. Cognera retrieves the most relevant sections from your notes and constructs a precise answer." },
                { n: "03", t: "Revise actively", b: "Generate flashcards and quizzes directly from your notes. Cognera structures them for spaced repetition." },
              ].map(({ n, t, b }) => (
                <div key={n} className="flex gap-5">
                  <span className="text-xs font-mono flex-shrink-0 mt-0.5" style={{ color: "var(--accent)", letterSpacing: "0.05em", fontWeight: 600 }}>{n}</span>
                  <div>
                    <h3 className="text-sm font-semibold mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--t1)" }}>{t}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--t2)" }}>{b}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            {[
              { label: "Document upload & indexing", detail: "PDFs are extracted, chunked into sections, and embedded into a vector store. Retrieval is semantic, not keyword search." },
              { label: "Source-grounded answers", detail: "Responses are generated only from retrieved sections of your documents. You see which document and section sourced each answer." },
              { label: "Conversation history", detail: "Every chat is saved to your account. Pick up where you left off, across any device." },
              { label: "Dark & light mode", detail: "Cognera adapts to how you study — late-night dark mode, morning light mode." },
            ].map(({ label, detail }) => (
              <div key={label} className="rounded-xl p-4" style={{ background: "var(--s1)", border: "1px solid var(--b1)" }}>
                <div className="flex items-start gap-3">
                  <Check size={14} className="flex-shrink-0 mt-0.5" style={{ color: "var(--accent)" }} strokeWidth={2.5} />
                  <div>
                    <p className="text-sm font-medium mb-0.5" style={{ color: "var(--t1)", fontFamily: "var(--font-display)" }}>{label}</p>
                    <p className="text-xs leading-relaxed" style={{ color: "var(--t3)" }}>{detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <hr className="section-rule" />

      {/* ── COMPARISON ────────────────────────────────────────────────── */}
      <Section id="compare" className="py-24">
        <div className="max-w-2xl mx-auto">
          <div className="mb-10 text-center">
            <p className="t-label mb-3">Why Cognera</p>
            <h2 className="t-h1">Built differently from general AI tools</h2>
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--b2)", background: "var(--s1)" }}>
            <table className="w-full">
              <thead>
                <tr style={{ background: "var(--s2)" }}>
                  <th className="py-3 px-4 text-left text-xs font-medium" style={{ color: "var(--t3)", width: "50%" }}></th>
                  <th className="py-3 px-4 text-center text-xs font-semibold" style={{ color: "var(--accent)", fontFamily: "var(--font-display)" }}>Cognera</th>
                  <th className="py-3 px-4 text-center text-xs" style={{ color: "var(--t3)" }}>Generic AI</th>
                </tr>
              </thead>
              <tbody className="px-4">
                {[
                  ["Answers from your own notes", true, false],
                  ["Cites the source for each answer", true, false],
                  ["Auto-generates flashcards from PDFs", true, false],
                  ["Conversation history saved", true, true],
                  ["General knowledge questions", true, true],
                  ["Code help & debugging", true, true],
                  ["Dark & light mode", true, false],
                ].map(([l, c, g]) => (
                  <CmpRow key={String(l)} label={String(l)} cognera={Boolean(c)} generic={Boolean(g)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <hr className="section-rule" />

      {/* ── TESTIMONIALS ──────────────────────────────────────────────── */}
      <Section className="py-24">
        <div className="mb-12 text-center">
          <p className="t-label mb-3">Built for students</p>
          <h2 className="t-h1">What students say</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { quote: "I uploaded my entire biochemistry module and was able to ask it questions the night before my exam. It cited page numbers from my own notes.", name: "Final year Biology student" },
            { quote: "The flashcard generator saved me hours. I used to manually create them from lecture slides — now it takes 10 seconds.", name: "Computer Science undergraduate" },
            { quote: "What I like most is it doesn't make things up. If the answer isn't in my notes it says so, which means I can actually trust it.", name: "Law student, second year" },
          ].map(({ quote, name }) => (
            <div key={name} className="rounded-2xl p-6" style={{ background: "var(--s1)", border: "1px solid var(--b1)" }}>
              <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--t1)" }}>"{quote}"</p>
              <p className="text-xs" style={{ color: "var(--t3)" }}>{name}</p>
            </div>
          ))}
        </div>
      </Section>

      <hr className="section-rule" />

      {/* ── CTA ───────────────────────────────────────────────────────── */}
      <Section className="py-28 text-center">
        <div className="max-w-xl mx-auto">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl mb-6"
            style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-border)" }}>
            <CogneraMark size={24} />
          </div>
          <h2 className="t-h1 mb-4">Ready to study smarter?</h2>
          <p className="t-lead mb-8">Upload your first document in under a minute. No credit card, no setup.</p>
          <Link href="/login" className="btn-cta inline-flex">
            Create a free account <ArrowRight size={14} strokeWidth={2.5} />
          </Link>
          <p className="mt-4 text-xs" style={{ color: "var(--t3)" }}>Free · No credit card · Works with any PDF</p>
        </div>
      </Section>

      <Footer />
    </div>
  );
}
