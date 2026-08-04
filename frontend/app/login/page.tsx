"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { createClient } from "@/lib/supabase/client";
import { CogneraWordmark } from "@/components/brand/CogneraLogo";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

type Mode = "login" | "signup";

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          prompt: (
            notification?: (notification: {
              isNotDisplayed: () => boolean;
              getNotDisplayedReason: () => string;
            }) => void
          ) => void;
        };
      };
    };
  }
}

function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );
}

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>("login");
  const [visible, setVisible] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [gisLoaded, setGisLoaded] = useState(false);

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    const urlError = searchParams?.get("error");
    if (urlError) {
      setError(decodeURIComponent(urlError));
    }
  }, [searchParams]);

  useEffect(() => {
    if (gisLoaded && googleClientId && window.google?.accounts?.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response: { credential: string }) => {
            setGoogleLoading(true);
            setError(null);
            try {
              const { error } = await supabase.auth.signInWithIdToken({
                provider: "google",
                token: response.credential,
              });

              if (error) {
                setError(error.message);
              } else {
                router.push("/chat");
                router.refresh();
              }
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Google authentication failed"
              );
            } finally {
              setGoogleLoading(false);
            }
          },
        });
      } catch (err) {
        console.warn("Google Identity Services init warning:", err);
      }
    }
  }, [gisLoaded, googleClientId, supabase, router]);

  function switchMode(next: Mode) {
    if (next === mode) return;
    setVisible(false);
    setError(null);
    setInfo(null);
    setTimeout(() => {
      setMode(next);
      setVisible(true);
    }, 160);
  }

  async function handleGoogleSignIn() {
    setError(null);
    setInfo(null);
    setGoogleLoading(true);

    if (googleClientId && window.google?.accounts?.id) {
      try {
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed()) {
            fallbackOAuthSignIn();
          }
        });
      } catch {
        fallbackOAuthSignIn();
      }
    } else {
      fallbackOAuthSignIn();
    }
  }

  async function fallbackOAuthSignIn() {
    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) {
        setError(error.message);
        setGoogleLoading(false);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to initiate Google sign in"
      );
      setGoogleLoading(false);
    }
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
      router.push("/chat");
      router.refresh();
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      setInfo("Check your email to confirm your account, then sign in.");
      switchMode("login");
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col justify-between px-4 py-6 sm:px-6 sm:py-10 relative">
      <Script
        src="https://accounts.google.com/gsi/client"
        onLoad={() => setGisLoaded(true)}
      />

      {/* Top Header / Back Link Container */}
      <div className="w-full max-w-sm sm:max-w-[390px] mx-auto flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--t3)] hover:text-[var(--t1)] transition-colors py-1"
        >
          <ArrowLeft size={14} strokeWidth={1.75} />
          <span>Back to home</span>
        </Link>
      </div>

      {/* Main Content Area */}
      <div className="my-auto w-full max-w-sm sm:max-w-[390px] mx-auto flex flex-col items-center py-4">
        {/* Logo */}
        <div className="mb-6 sm:mb-8">
          <CogneraWordmark size={28} />
        </div>

        {/* Auth Card */}
        <div
          className={`w-full rounded-2xl sm:rounded-3xl border border-[var(--b1)] bg-[var(--s1)] p-5 sm:p-8 shadow-sm transition-opacity duration-160 ${
            visible ? "opacity-100" : "opacity-0"
          }`}
          style={{ boxShadow: "var(--card-shadow)" }}
        >
          {/* Heading */}
          <div className="mb-5 sm:mb-6">
            <h1 className="font-display text-lg sm:text-xl font-bold tracking-tight text-[var(--t1)] mb-1">
              {mode === "login" ? "Welcome back" : "Create an account"}
            </h1>
            <p className="text-xs sm:text-sm text-[var(--t2)] leading-normal">
              {mode === "login"
                ? "Sign in to access your study assistant."
                : "Start organizing your study workflow today."}
            </p>
          </div>

          {/* Google OAuth Button */}
          <div className="mb-5">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading}
              className="w-full inline-flex items-center justify-center gap-2.5 rounded-xl border border-[var(--b2)] bg-[var(--s2)] px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium text-[var(--t1)] transition-colors hover:bg-[var(--s3)] hover:border-[var(--b3)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <GoogleIcon size={18} />
              <span>{googleLoading ? "Connecting to Google…" : "Continue with Google"}</span>
            </button>
          </div>

          {/* Hairline Divider */}
          <div className="mb-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--b1)]" />
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[var(--t3)]">
              or
            </span>
            <div className="h-px flex-1 bg-[var(--b1)]" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-[var(--t3)] mb-1.5"
              >
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                placeholder="you@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-[var(--b2)] bg-[var(--bg)] px-3.5 py-2.5 text-base sm:text-sm text-[var(--t1)] outline-none transition-all placeholder-[var(--t3)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-[var(--t3)] mb-1.5"
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
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-[var(--b2)] bg-[var(--bg)] px-3.5 py-2.5 text-base sm:text-sm text-[var(--t1)] outline-none transition-all placeholder-[var(--t3)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              />
            </div>

            {/* Feedback Alerts */}
            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-500 leading-normal">
                {error}
              </div>
            )}
            {info && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-500 leading-normal">
                {info}
              </div>
            )}

            {/* Submit CTA */}
            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full rounded-xl bg-[var(--t1)] py-2.5 sm:py-3 text-xs sm:text-sm font-semibold text-[var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading
                ? "Please wait…"
                : mode === "login"
                ? "Sign in"
                : "Create account"}
            </button>
          </form>

          {/* Mode Switch */}
          <div className="mt-4 pt-1">
            <button
              type="button"
              onClick={() => switchMode(mode === "login" ? "signup" : "login")}
              className="w-full rounded-xl border border-[var(--b1)] py-2.5 text-xs text-[var(--t2)] transition-colors hover:border-[var(--b2)] hover:text-[var(--t1)]"
            >
              {mode === "login"
                ? "Need an account? Create one"
                : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </div>

      {/* Footer / Fine Print */}
      <div className="w-full max-w-sm sm:max-w-[390px] mx-auto text-center pt-2">
        <p className="text-[11px] text-[var(--t3)]">
          By continuing you agree to Cognera's{" "}
          <Link href="#" className="text-[var(--t2)] underline underline-offset-2">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="#" className="text-[var(--t2)] underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-xs text-[var(--t3)]">
          Loading auth…
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
