"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CogneraWordmark } from "@/components/brand/CogneraLogo";

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
    setFading(true); setError(null); setInfo(null);
    setTimeout(() => { setMode(next); setFading(false); }, 140);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setInfo(null); setLoading(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) { setError(error.message); return; }
      router.push("/chat"); router.refresh();
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) { setError(error.message); return; }
      setInfo("Check your email to confirm, then sign in.");
      switchMode("login");
    }
  }

  const inputBase: React.CSSProperties = {
    width: "100%", background: "var(--bg)",
    border: "1px solid var(--b2)", borderRadius: "10px",
    padding: "11px 14px", fontSize: "14px",
    color: "var(--t1)", outline: "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
    fontFamily: "var(--font-sans)",
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <Link href="/" className="absolute top-5 left-5 text-xs transition-colors" style={{ color: "var(--t3)" }}
        onMouseEnter={e => (e.currentTarget.style.color = "var(--t2)")}
        onMouseLeave={e => (e.currentTarget.style.color = "var(--t3)")}>← Back to home</Link>

      <div className="w-full max-w-[360px]">
        <div className="mb-8 flex justify-center"><CogneraWordmark size={26} /></div>
        <div className="rounded-2xl p-7" style={{ background: "var(--s1)", border: "1px solid var(--b1)" }}>
          <div style={{ transition: "opacity 0.14s", opacity: fading ? 0 : 1 }}>
            <h1 className="mb-1 font-semibold text-lg" style={{ fontFamily: "var(--font-display)", color: "var(--t1)", letterSpacing: "-0.02em" }}>
              {mode === "login" ? "Welcome back" : "Create account"}
            </h1>
            <p className="mb-6 text-sm" style={{ color: "var(--t3)" }}>
              {mode === "login" ? "Sign in to continue to Cognera" : "Free to get started, no card needed"}
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input type="email" required placeholder="Email" aria-label="Email"
                value={email} onChange={e => setEmail(e.target.value)} style={inputBase}
                onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-soft)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "var(--b2)"; e.currentTarget.style.boxShadow = "none"; }} />
              <input type="password" required minLength={6} placeholder="Password" aria-label="Password"
                value={password} onChange={e => setPassword(e.target.value)} style={inputBase}
                onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-soft)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "var(--b2)"; e.currentTarget.style.boxShadow = "none"; }} />
              {error && <p className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}
              {info && <p className="text-sm" style={{ color: "var(--green)" }}>{info}</p>}
              <button type="submit" disabled={loading} className="btn-cta w-full" style={{ marginTop: "8px" }}>
                {loading ? "Please wait…" : mode === "login" ? "Continue" : "Create account"}
              </button>
            </form>
          </div>
        </div>
        <p className="mt-5 text-center text-sm" style={{ color: "var(--t3)" }}>
          {mode === "login" ? "No account? " : "Already have one? "}
          <button type="button" onClick={() => switchMode(mode === "login" ? "signup" : "login")}
            className="transition-colors" style={{ color: "var(--t2)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--t1)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--t2)")}>
            {mode === "login" ? "Sign up free" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
