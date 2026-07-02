"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CogneraWordmark } from "@/components/brand/CogneraLogo";

type Mode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>("login");
  // Drives the cross-fade: when switching modes we fade the card content
  // out, swap the copy/handlers, then fade back in — avoids a jarring
  // instant swap or a full page reload.
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
    window.setTimeout(() => {
      setMode(next);
      setFading(false);
    }, 150);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.push("/");
      router.refresh();
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      setInfo("Account created. Check your email to confirm, then log in below.");
      switchMode("login");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm rounded-[20px] border border-border bg-surface px-8 py-10 shadow-[0_4px_24px_rgba(0,0,0,0.25)]">
        <div
          className={`flex flex-col items-center transition-opacity duration-150 ${
            fading ? "opacity-0" : "opacity-100"
          }`}
        >
          <CogneraWordmark iconSize={32} />

          <h1 className="mt-8 text-xl font-medium text-ink">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-2 text-center text-sm text-muted">
            {mode === "login"
              ? "Log in to pick up where you left off."
              : "Takes about a minute — no credit card needed."}
          </p>

          <form
            onSubmit={handleSubmit}
            className="mt-8 flex w-full flex-col gap-4"
            aria-label={mode === "login" ? "Log in form" : "Sign up form"}
          >
            <input
              type="email"
              required
              placeholder="Email address"
              aria-label="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="gradient-border-glow rounded-xl border border-border bg-bg px-4 py-3 text-sm text-ink outline-none transition-shadow placeholder:text-muted"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password"
              aria-label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="gradient-border-glow rounded-xl border border-border bg-bg px-4 py-3 text-sm text-ink outline-none transition-shadow placeholder:text-muted"
            />

            {error && (
              <p role="alert" className="text-sm text-[#f28b82]">
                {error}
              </p>
            )}
            {info && (
              <p role="status" className="text-sm text-[#81c995]">
                {info}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              aria-label={mode === "login" ? "Log in" : "Sign up"}
              className="btn-primary mt-2 w-full justify-center"
            >
              {loading ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => switchMode(mode === "login" ? "signup" : "login")}
            className="mt-6 text-sm text-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
          >
            {mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
          </button>
        </div>
      </div>
    </main>
  );
}
