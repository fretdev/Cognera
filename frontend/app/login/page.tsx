"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CogneraWordmark } from "@/components/brand/CogneraLogo";
import Link from "next/link";

type Mode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>("login");
  const [fading, setFading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function switchMode(next: Mode) {
    if (next === mode) return;
    setFading(true);
    setError(null);
    setInfo(null);
    setTimeout(() => { setMode(next); setFading(false); }, 140);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) { setError(error.message); return; }
      router.push("/chat");
      router.refresh();
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) { setError(error.message); return; }
      setInfo("Check your email to confirm, then sign in.");
      switchMode("login");
    }
  }

  const inputStyle = {
    width: "100%",
    background: "var(--surface-1)",
    border: "1px solid var(--border-2)",
    borderRadius: "10px",
    padding: "11px 14px",
    fontSize: "14px",
    color: "var(--text-1)",
    outline: "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
    fontFamily: "var(--font-sans)",
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "var(--bg)" }}>

      {/* Back to home */}
      <Link href="/" className="absolute top-6 left-6 flex items-center gap-2 text-xs transition-colors"
        style={{ color: "var(--text-3)" }}
        onMouseEnter={e => (e.currentTarget.style.color = "var(--text-2)")}
        onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}>
        ← Back
      </Link>

      <div className="w-full max-w-[360px]">
        {/* Logo */}
        <div className="mb-10 flex justify-center">
          <CogneraWordmark size={26} />
        </div>

        {/* Card */}
        <div className="rounded-2xl p-8" style={{ background: "var(--surface-1)", border: "1px solid var(--border-1)" }}>
          <div style={{ transition: "opacity 0.14s", opacity: fading ? 0 : 1 }}>
            {/* Heading */}
            <h1 className="mb-1 text-lg font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--text-1)", letterSpacing: "-0.02em" }}>
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mb-7 text-sm" style={{ color: "var(--text-3)" }}>
              {mode === "login" ? "Sign in to continue to Cognera" : "Free to get started, no card needed"}
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                required
                placeholder="Email"
                aria-label="Email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-dim)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "var(--border-2)"; e.currentTarget.style.boxShadow = "none"; }}
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Password"
                aria-label="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-dim)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "var(--border-2)"; e.currentTarget.style.boxShadow = "none"; }}
              />

              {error && (
                <p className="text-sm" style={{ color: "var(--red)" }}>{error}</p>
              )}
              {info && (
                <p className="text-sm" style={{ color: "var(--green)" }}>{info}</p>
              )}

              {/* Submit — white button, dark text. Not accent-colored. */}
              <button
                type="submit"
                disabled={loading}
                className="btn-cta w-full mt-4"
                style={{ marginTop: "16px" }}
              >
                {loading ? "Please wait…" : mode === "login" ? "Continue" : "Create account"}
              </button>
            </form>
          </div>
        </div>

        {/* Toggle */}
        <p className="mt-6 text-center text-sm" style={{ color: "var(--text-3)" }}>
          {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          <button
            type="button"
            onClick={() => switchMode(mode === "login" ? "signup" : "login")}
            className="transition-colors"
            style={{ color: "var(--text-2)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--text-1)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-2)")}>
            {mode === "login" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
