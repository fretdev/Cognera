"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check, Pencil, Trash2, LogOut,
  FileText, MessageSquare, Layers, ClipboardCheck,
  Sun, Moon, AlertTriangle, X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import { apiGet, apiPatch, apiDelete } from "@/lib/api";

/* ── Types ─────────────────────────────────────────────────────────────── */
type Profile = {
  email: string | null;
  display_name: string | null;
  stats: {
    documents: number;
    conversations: number;
    flashcards: number;
    quizzes: number;
  };
};

/* ── Avatar ─────────────────────────────────────────────────────────────── */
function Avatar({ name, email, size = 72 }: { name?: string | null; email?: string | null; size?: number }) {
  const initials = name
    ? name.trim().split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : (email?.[0] ?? "?").toUpperCase();

  return (
    <div
      aria-label="Profile avatar"
      style={{
        width: size, height: size, borderRadius: "50%",
        background: "linear-gradient(135deg, var(--accent) 0%, #FF9A3C 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
        boxShadow: "0 0 0 3px var(--s1), 0 0 0 5px var(--accent-border)",
      }}
    >
      <span style={{
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: size * 0.34,
        color: "#fff",
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}>
        {initials}
      </span>
    </div>
  );
}

/* ── Stat card ──────────────────────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div style={{
      background: "var(--s1)", border: "1px solid var(--b1)",
      borderRadius: "14px", padding: "18px 20px",
      display: "flex", alignItems: "center", gap: "14px",
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: "9px", flexShrink: 0,
        background: "var(--accent-soft)", border: "1px solid var(--accent-border)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={16} style={{ color: "var(--accent)" }} strokeWidth={1.75} />
      </div>
      <div>
        <p style={{ fontSize: "20px", fontWeight: 700, color: "var(--t1)", fontFamily: "var(--font-display)", letterSpacing: "-0.03em", lineHeight: 1 }}>
          {value.toLocaleString()}
        </p>
        <p style={{ fontSize: "12px", color: "var(--t3)", marginTop: "3px" }}>{label}</p>
      </div>
    </div>
  );
}

/* ── Section wrapper ────────────────────────────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "28px" }}>
      <p style={{
        fontSize: "11px", fontWeight: 600, letterSpacing: "0.07em",
        textTransform: "uppercase", color: "var(--t3)", marginBottom: "12px",
      }}>
        {title}
      </p>
      <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: "16px", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

/* ── Row ────────────────────────────────────────────────────────────────── */
function Row({
  label, value, action, danger = false, onClick, noBorder = false,
}: {
  label: string;
  value?: React.ReactNode;
  action?: React.ReactNode;
  danger?: boolean;
  onClick?: () => void;
  noBorder?: boolean;
}) {
  const isClickable = !!onClick;
  return (
    <div
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={isClickable ? e => e.key === "Enter" && onClick() : undefined}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 18px", gap: "12px",
        borderTop: noBorder ? "none" : "1px solid var(--b1)",
        cursor: isClickable ? "pointer" : "default",
        transition: "background 0.12s",
      }}
      onMouseEnter={e => { if (isClickable) (e.currentTarget as HTMLElement).style.background = "var(--s2)"; }}
      onMouseLeave={e => { if (isClickable) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <span style={{ fontSize: "14px", color: danger ? "var(--red)" : "var(--t1)", fontWeight: 400 }}>
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        {value && <span style={{ fontSize: "13.5px", color: "var(--t3)" }}>{value}</span>}
        {action}
      </div>
    </div>
  );
}

/* ── Confirm modal ──────────────────────────────────────────────────────── */
function ConfirmModal({
  title, body, confirmLabel, onConfirm, onCancel, danger = true,
}: {
  title: string; body: string; confirmLabel: string;
  onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "16px",
      background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
    }}>
      <div style={{
        width: "100%", maxWidth: "380px",
        background: "var(--s1)", border: "1px solid var(--b2)",
        borderRadius: "18px", padding: "28px 24px",
      }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "16px" }}>
          <AlertTriangle size={18} style={{ color: "var(--red)", flexShrink: 0, marginTop: "1px" }} />
          <div>
            <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "15px", color: "var(--t1)", marginBottom: "6px" }}>{title}</h3>
            <p style={{ fontSize: "13.5px", color: "var(--t2)", lineHeight: 1.6 }}>{body}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button onClick={onCancel} className="btn-primary" style={{ padding: "8px 16px", fontSize: "13px" }}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "8px 16px", fontSize: "13px", fontWeight: 500,
              borderRadius: "9999px", border: "none",
              background: danger ? "var(--red)" : "var(--t1)",
              color: "#fff", cursor: "pointer", transition: "opacity 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main panel ─────────────────────────────────────────────────────────── */
export default function ProfilePanel() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [modal, setModal] = useState<"clear-chats" | "delete-account" | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiGet<Profile>("/profile")
      .then(p => { setProfile(p); setNameInput(p.display_name || ""); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (editingName) nameRef.current?.focus();
  }, [editingName]);

  async function saveName() {
    if (!nameInput.trim()) return;
    setNameSaving(true);
    setNameError(null);
    try {
    const res = await apiPatch<{ display_name: string }>("/profile", { display_name: nameInput.trim() });
      setProfile(prev => prev ? { ...prev, display_name: res.display_name } : prev);
      setEditingName(false);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setNameSaving(false);
    }
  }

  async function handleClearChats() {
    setActionLoading(true);
    try {
      await apiDelete("/profile/conversations");
      setModal(null);
      setProfile(prev => prev ? { ...prev, stats: { ...prev.stats, conversations: 0 } } : prev);
    } catch { /* silent */ }
    finally { setActionLoading(false); }
  }

  async function handleDeleteAccount() {
    // Sign out — full account deletion requires a backend edge function
    // with service_role which is beyond the scope of this build. Signing
    // out and clearing data is the safe equivalent for now.
    setActionLoading(true);
    await createClient().auth.signOut();
    router.push("/");
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div style={{ display: "flex", gap: "6px" }}>
          <span className="thinking-dot" />
          <span className="thinking-dot" />
          <span className="thinking-dot" />
        </div>
      </div>
    );
  }

  const displayName = profile?.display_name || profile?.email?.split("@")[0] || "Student";

  return (
    <>
      {modal === "clear-chats" && (
        <ConfirmModal
          title="Clear all conversations?"
          body="This permanently deletes all your chat history. Your uploaded documents, flashcards, and quizzes will remain."
          confirmLabel="Clear chats"
          onConfirm={handleClearChats}
          onCancel={() => setModal(null)}
        />
      )}
      {modal === "delete-account" && (
        <ConfirmModal
          title="Delete your account?"
          body="This signs you out and clears your session. To fully delete account data, contact support."
          confirmLabel="Sign out & leave"
          onConfirm={handleDeleteAccount}
          onCancel={() => setModal(null)}
        />
      )}

      <div style={{ maxWidth: "680px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "40px" }}>
          <Avatar name={profile?.display_name} email={profile?.email} size={72} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingName ? (
              <div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    ref={nameRef}
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                    maxLength={60}
                    placeholder="Your name"
                    style={{
                      background: "var(--s2)", border: "1px solid var(--accent)",
                      borderRadius: "8px", padding: "7px 12px",
                      fontSize: "18px", fontWeight: 600,
                      color: "var(--t1)", outline: "none", width: "100%",
                      fontFamily: "var(--font-display)", letterSpacing: "-0.02em",
                      boxShadow: "0 0 0 3px var(--accent-soft)",
                    }}
                  />
                  <button onClick={saveName} disabled={nameSaving} aria-label="Save name"
                    style={{
                      background: "var(--accent)", color: "#fff", border: "none",
                      borderRadius: "8px", padding: "8px 12px", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: "5px",
                      fontSize: "13px", fontWeight: 500, flexShrink: 0,
                    }}>
                    <Check size={14} strokeWidth={2.5} />
                    {nameSaving ? "Saving…" : "Save"}
                  </button>
                  <button onClick={() => setEditingName(false)} aria-label="Cancel"
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--t3)", padding: "8px" }}>
                    <X size={15} />
                  </button>
                </div>
                {nameError && <p style={{ fontSize: "12px", color: "var(--red)", marginTop: "6px" }}>{nameError}</p>}
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <h1 style={{
                  fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "22px",
                  color: "var(--t1)", letterSpacing: "-0.03em", lineHeight: 1,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {displayName}
                </h1>
                <button onClick={() => setEditingName(true)} aria-label="Edit display name"
                  style={{
                    background: "transparent", border: "none", cursor: "pointer",
                    color: "var(--t3)", padding: "4px", borderRadius: "6px",
                    display: "flex", alignItems: "center", transition: "color 0.12s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = "var(--t1)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "var(--t3)")}>
                  <Pencil size={14} strokeWidth={1.75} />
                </button>
              </div>
            )}
            <p style={{ fontSize: "13.5px", color: "var(--t3)", marginTop: "5px" }}>
              {profile?.email}
            </p>
          </div>
        </div>

        {/* ── Stats ── */}
        <div style={{ marginBottom: "32px" }}>
          <p style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--t3)", marginBottom: "12px" }}>
            Study activity
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>
            <StatCard icon={FileText} label="Documents uploaded" value={profile?.stats.documents ?? 0} />
            <StatCard icon={MessageSquare} label="Conversations" value={profile?.stats.conversations ?? 0} />
            <StatCard icon={Layers} label="Flashcards generated" value={profile?.stats.flashcards ?? 0} />
            <StatCard icon={ClipboardCheck} label="Quiz questions" value={profile?.stats.quizzes ?? 0} />
          </div>
        </div>

        {/* ── Appearance ── */}
        <Section title="Appearance">
          <Row noBorder label="Theme"
            value={theme === "dark" ? "Dark" : "Light"}
            action={
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label="Toggle theme"
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "6px 12px", borderRadius: "9999px",
                  background: "var(--s3)", border: "1px solid var(--b2)",
                  color: "var(--t1)", fontSize: "12.5px", cursor: "pointer",
                  transition: "background 0.12s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--s4)")}
                onMouseLeave={e => (e.currentTarget.style.background = "var(--s3)")}
              >
                {theme === "dark"
                  ? <><Sun size={13} strokeWidth={1.75} /> Switch to light</>
                  : <><Moon size={13} strokeWidth={1.75} /> Switch to dark</>}
              </button>
            }
          />
        </Section>

        {/* ── Account ── */}
        <Section title="Account">
          <Row noBorder label="Email" value={profile?.email} />
          <Row label="Sign out"
            action={<LogOut size={14} style={{ color: "var(--t3)" }} strokeWidth={1.75} />}
            onClick={async () => { await createClient().auth.signOut(); router.push("/"); }}
          />
        </Section>

        {/* ── Data & privacy ── */}
        <Section title="Data & privacy">
          <Row noBorder label="Clear all conversations"
            action={<Trash2 size={14} style={{ color: "var(--t3)" }} strokeWidth={1.75} />}
            onClick={() => setModal("clear-chats")}
          />
          <Row label="Delete account"
            danger
            action={<Trash2 size={14} style={{ color: "var(--red)" }} strokeWidth={1.75} />}
            onClick={() => setModal("delete-account")}
          />
        </Section>

        <p style={{ fontSize: "12px", color: "var(--t3)", textAlign: "center", marginTop: "8px" }}>
          Cognera · Built for students worldwide
        </p>
      </div>
    </>
  );
}
