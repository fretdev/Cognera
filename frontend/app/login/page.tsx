"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CogneraWordmark } from "@/components/brand/CogneraLogo";
import { ArrowLeft } from "lucide-react";

type Mode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>("login");
  const [visible, setVisible] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function switchMode(next: Mode) {
    if (next === mode) return;
    setVisible(false);
    setError(null);
    setInfo(null);
    setTimeout(() => { setMode(next); setVisible(true); }, 160);
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
      setInfo("Check your email to confirm your account, then sign in.");
      switchMode("login");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
      }}
    >
      {/* Back link */}
      <Link
        href="/"
        style={{
          position: "absolute", top: "20px", left: "20px",
          display: "inline-flex", alignItems: "center", gap: "6px",
          fontSize: "13px", color: "var(--t3)",
          textDecoration: "none", transition: "color 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.color = "var(--t2)")}
        onMouseLeave={e => (e.currentTarget.style.color = "var(--t3)")}
      >
        <ArrowLeft size={14} strokeWidth={1.75} />
        Back
      </Link>

      {/* Logo */}
      <div style={{ marginBottom: "36px" }}>
        <CogneraWordmark size={28} />
      </div>

      {/* Card */}
      <div
        style={{
          width: "100%", maxWidth: "380px",
          background: "var(--s1)",
          border: "1px solid var(--b1)",
          borderRadius: "20px",
          padding: "36px 32px",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.16s ease",
          boxShadow: "var(--card-shadow)",
        }}
      >
        {/* Heading */}
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{
            fontFamily: "var(--font-display)",
            fontSize: "20px",
            fontWeight: 700,
            letterSpacing: "-0.025em",
            color: "var(--t1)",
            marginBottom: "6px",
          }}>
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p style={{ fontSize: "13.5px", color: "var(--t3)", lineHeight: 1.5 }}>
            {mode === "login"
              ? "Sign in to continue to Cognera."
              : "Free to get started — no credit card needed."}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div style={{ marginBottom: "12px" }}>
            <label
              htmlFor="email"
              style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--t3)", marginBottom: "6px", letterSpacing: "0.02em" }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              placeholder="you@university.edu"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                width: "100%",
                background: "var(--bg)",
                border: "1px solid var(--b2)",
                borderRadius: "10px",
                padding: "11px 14px",
                fontSize: "14px",
                color: "var(--t1)",
                outline: "none",
                fontFamily: "var(--font-sans)",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = "var(--accent)";
                e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-soft)";
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = "var(--b2)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: "20px" }}>
            <label
              htmlFor="password"
              style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--t3)", marginBottom: "6px", letterSpacing: "0.02em" }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              placeholder="At least 6 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                width: "100%",
                background: "var(--bg)",
                border: "1px solid var(--b2)",
                borderRadius: "10px",
                padding: "11px 14px",
                fontSize: "14px",
                color: "var(--t1)",
                outline: "none",
                fontFamily: "var(--font-sans)",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = "var(--accent)";
                e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-soft)";
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = "var(--b2)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          {/* Feedback */}
          {error && (
            <div style={{
              background: "rgba(242,107,107,0.08)",
              border: "1px solid rgba(242,107,107,0.25)",
              borderRadius: "8px",
              padding: "10px 14px",
              marginBottom: "16px",
              fontSize: "13px",
              color: "var(--red)",
            }}>
              {error}
            </div>
          )}
          {info && (
            <div style={{
              background: "rgba(62,207,142,0.08)",
              border: "1px solid rgba(62,207,142,0.25)",
              borderRadius: "8px",
              padding: "10px 14px",
              marginBottom: "16px",
              fontSize: "13px",
              color: "var(--green)",
            }}>
              {info}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="btn-cta"
            style={{ width: "100%", padding: "12px", fontSize: "14px" }}
          >
            {loading
              ? "Please wait…"
              : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        {/* Divider */}
        <div style={{
          display: "flex", alignItems: "center", gap: "12px",
          margin: "24px 0",
        }}>
          <div style={{ flex: 1, height: "1px", background: "var(--b1)" }} />
          <span style={{ fontSize: "12px", color: "var(--t3)" }}>or</span>
          <div style={{ flex: 1, height: "1px", background: "var(--b1)" }} />
        </div>

        {/* Mode switch */}
        <button
          type="button"
          onClick={() => switchMode(mode === "login" ? "signup" : "login")}
          style={{
            width: "100%", padding: "11px",
            background: "transparent",
            border: "1px solid var(--b2)",
            borderRadius: "10px",
            fontSize: "13.5px",
            color: "var(--t2)",
            cursor: "pointer",
            transition: "border-color 0.15s, color 0.15s",
            fontFamily: "var(--font-sans)",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = "var(--b3)";
            e.currentTarget.style.color = "var(--t1)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = "var(--b2)";
            e.currentTarget.style.color = "var(--t2)";
          }}
        >
          {mode === "login" ? "Create a free account" : "Already have an account? Sign in"}
        </button>
      </div>

      {/* Fine print */}
      <p style={{ marginTop: "20px", fontSize: "12px", color: "var(--t3)", textAlign: "center" }}>
        By continuing you agree to our{" "}
        <Link href="#" style={{ color: "var(--t2)", textDecoration: "underline" }}>Terms</Link>
        {" "}and{" "}
        <Link href="#" style={{ color: "var(--t2)", textDecoration: "underline" }}>Privacy Policy</Link>
        .
      </p>
    </div>
  );
}
