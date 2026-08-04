"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Pencil,
  Trash2,
  LogOut,
  FileText,
  MessageSquare,
  Layers,
  ClipboardCheck,
  Sun,
  Moon,
  AlertTriangle,
  X,
  GraduationCap,
  Building2,
  Calendar,
  Target,
  CheckCircle2,
  Flame,
  Sparkles,
} from "lucide-react";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import { apiGet, apiPatch, apiDelete } from "@/lib/api";

/* ── Types ─────────────────────────────────────────────────────────────── */
export type ProfileStats = {
  documents: number;
  conversations: number;
  flashcards: number;
  quizzes: number;
  planner_total: number;
  planner_completed: number;
  upcoming_exams: number;
};

export type Profile = {
  email: string | null;
  display_name: string | null;
  major: string | null;
  institution: string | null;
  graduation_year: string | null;
  study_goal: string | null;
  stats: ProfileStats;
};

/* ── Avatar ─────────────────────────────────────────────────────────────── */
function Avatar({
  name,
  email,
  size = 72,
}: {
  name?: string | null;
  email?: string | null;
  size?: number;
}) {
  const initials =
    name && name.trim().length > 0
      ? name
          .trim()
          .split(" ")
          .map((w) => w[0])
          .slice(0, 2)
          .join("")
          .toUpperCase()
      : (email?.[0] ?? "S").toUpperCase();

  return (
    <div
      aria-label="Profile avatar"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--accent-soft)",
        border: "1.5px solid var(--accent-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: size * 0.36,
          color: "var(--accent)",
          lineHeight: 1,
        }}
      >
        {initials}
      </span>
    </div>
  );
}

/* ── Stat Card ──────────────────────────────────────────────────────────── */
function StatCard({
  icon: Icon,
  label,
  value,
  isHighlight = false,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  isHighlight?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3.5 rounded-2xl p-3.5 sm:p-4 transition-all hover:border-[var(--b2)]"
      style={{
        background: "var(--s1)",
        border: "1px solid var(--b1)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{
          background: isHighlight ? "var(--accent-soft)" : "var(--s2)",
          border: isHighlight ? "1px solid var(--accent-border)" : "1px solid var(--b2)",
        }}
      >
        <Icon
          size={16}
          strokeWidth={1.75}
          className={isHighlight ? "text-[var(--accent)]" : "text-[var(--t2)]"}
        />
      </div>
      <div className="min-w-0">
        <p className="text-base sm:text-lg font-semibold text-[var(--t1)] leading-none truncate">
          {value.toLocaleString()}
        </p>
        <p className="mt-1 text-[11px] font-medium text-[var(--t3)] truncate">{label}</p>
      </div>
    </div>
  );
}

/* ── Section Wrapper ────────────────────────────────────────────────────── */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <p className="mb-2 text-[11px] font-semibold tracking-wider uppercase text-[var(--t3)]">
        {title}
      </p>
      <div
        className="overflow-hidden rounded-2xl"
        style={{
          background: "var(--s1)",
          border: "1px solid var(--b1)",
          boxShadow: "var(--card-shadow)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ── Row ────────────────────────────────────────────────────────────────── */
function Row({
  label,
  value,
  action,
  danger = false,
  onClick,
  noBorder = false,
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
      onKeyDown={isClickable ? (e) => e.key === "Enter" && onClick() : undefined}
      className={`flex items-center justify-between gap-3 px-4 py-3.5 text-xs sm:px-5 sm:text-sm transition-colors ${
        noBorder ? "" : "border-t border-[var(--b1)]"
      } ${isClickable ? "cursor-pointer hover:bg-[var(--s2)]" : "cursor-default"}`}
    >
      <span className={danger ? "text-red-500 font-medium" : "text-[var(--t1)]"}>
        {label}
      </span>
      <div className="flex items-center gap-2">
        {value && <span className="text-xs text-[var(--t3)]">{value}</span>}
        {action}
      </div>
    </div>
  );
}

/* ── Modal ──────────────────────────────────────────────────────────────── */
function ConfirmModal({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = true,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div
        className="w-full max-w-sm rounded-2xl p-5 sm:p-6 shadow-xl"
        style={{ background: "var(--s1)", border: "1px solid var(--b2)" }}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-500" />
          <div>
            <h3 className="text-sm font-medium text-[var(--t1)]">{title}</h3>
            <p className="mt-1 text-xs text-[var(--t2)] leading-relaxed">{body}</p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="btn-primary py-1.5 px-3.5 text-xs">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-full py-1.5 px-3.5 text-xs font-medium text-white transition-opacity hover:opacity-90 ${
              danger ? "bg-red-600" : "bg-[var(--accent)]"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Profile Component ─────────────────────────────────────────────── */
export default function ProfilePanel() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit Name & Credentials State
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [majorInput, setMajorInput] = useState("");
  const [institutionInput, setInstitutionInput] = useState("");
  const [gradYearInput, setGradYearInput] = useState("");
  const [studyGoalInput, setStudyGoalInput] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [modal, setModal] = useState<"clear-chats" | "delete-account" | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiGet<Profile>("/profile")
      .then((p) => {
        setProfile(p);
        setNameInput(p.display_name || "");
        setMajorInput(p.major || "");
        setInstitutionInput(p.institution || "");
        setGradYearInput(p.graduation_year || "");
        setStudyGoalInput(p.study_goal || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (editing) nameRef.current?.focus();
  }, [editing]);

  async function handleSave() {
    if (!nameInput.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        display_name: nameInput.trim(),
        major: majorInput.trim() || undefined,
        institution: institutionInput.trim() || undefined,
        graduation_year: gradYearInput.trim() || undefined,
        study_goal: studyGoalInput.trim() || undefined,
      };
      const res = await apiPatch<Profile>("/profile", payload);
      setProfile(res);
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleClearChats() {
    try {
      await apiDelete("/profile/conversations");
      setModal(null);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              stats: { ...prev.stats, conversations: 0 },
            }
          : prev
      );
    } catch {
      // silent
    }
  }

  async function handleDeleteAccount() {
    await createClient().auth.signOut();
    router.push("/");
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex gap-1.5">
          <span className="thinking-dot" />
          <span className="thinking-dot" />
          <span className="thinking-dot" />
        </div>
      </div>
    );
  }

  const displayName =
    profile?.display_name || profile?.email?.split("@")[0] || "Student";

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      {/* Confirm Modals */}
      {modal === "clear-chats" && (
        <ConfirmModal
          title="Clear all conversations?"
          body="This permanently deletes your chat history. Uploaded documents, flashcards, and study planner tasks remain intact."
          confirmLabel="Clear chats"
          onConfirm={handleClearChats}
          onCancel={() => setModal(null)}
        />
      )}
      {modal === "delete-account" && (
        <ConfirmModal
          title="Sign out of session?"
          body="This signs you out of your current session on this device."
          confirmLabel="Sign out"
          onConfirm={handleDeleteAccount}
          onCancel={() => setModal(null)}
        />
      )}

      {/* ── Header Module ─────────────────────────────────────────────────── */}
      <div className="mb-6 sm:mb-8 flex items-start gap-4 sm:gap-5">
        <Avatar name={displayName} email={profile?.email} size={64} />

        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-3 rounded-2xl border border-[var(--b2)] bg-[var(--s1)] p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--t2)]">Edit Credentials</span>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="text-[var(--t3)] hover:text-[var(--t1)]"
                >
                  <X size={15} />
                </button>
              </div>

              <div>
                <label className="block text-[11px] text-[var(--t3)] mb-1">Display Name *</label>
                <input
                  ref={nameRef}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  maxLength={60}
                  className="w-full rounded-xl border border-[var(--b2)] bg-[var(--s2)] px-3 py-1.5 text-sm text-[var(--t1)] outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-[var(--t3)] mb-1">Major</label>
                  <input
                    value={majorInput}
                    onChange={(e) => setMajorInput(e.target.value)}
                    placeholder="e.g. Computer Science"
                    className="w-full rounded-xl border border-[var(--b2)] bg-[var(--s2)] px-3 py-1.5 text-xs text-[var(--t1)] outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--t3)] mb-1">Grad Year</label>
                  <input
                    value={gradYearInput}
                    onChange={(e) => setGradYearInput(e.target.value)}
                    placeholder="e.g. 2026"
                    className="w-full rounded-xl border border-[var(--b2)] bg-[var(--s2)] px-3 py-1.5 text-xs text-[var(--t1)] outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-[var(--t3)] mb-1">University / Institution</label>
                <input
                  value={institutionInput}
                  onChange={(e) => setInstitutionInput(e.target.value)}
                  placeholder="e.g. Stanford University"
                  className="w-full rounded-xl border border-[var(--b2)] bg-[var(--s2)] px-3 py-1.5 text-xs text-[var(--t1)] outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[var(--t3)] mb-1">Target Study Goal</label>
                <input
                  value={studyGoalInput}
                  onChange={(e) => setStudyGoalInput(e.target.value)}
                  placeholder="e.g. Maintain 3.8 GPA & Master Algorithms"
                  className="w-full rounded-xl border border-[var(--b2)] bg-[var(--s2)] px-3 py-1.5 text-xs text-[var(--t1)] outline-none focus:border-[var(--accent)]"
                />
              </div>

              {saveError && <p className="text-xs text-red-500">{saveError}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="btn-primary text-xs py-1 px-3"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary text-xs py-1 px-3 bg-[var(--accent)] text-white hover:opacity-90"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-medium text-[var(--t1)] sm:text-xl truncate">
                  {displayName}
                </h1>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  aria-label="Edit details"
                  className="rounded-md p-1 text-[var(--t3)] transition-colors hover:text-[var(--t1)]"
                >
                  <Pencil size={14} strokeWidth={1.75} />
                </button>
              </div>

              <p className="mt-0.5 text-xs text-[var(--t3)] truncate">{profile?.email}</p>

              {/* Academic Tags */}
              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                {profile?.major && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-[var(--s2)] px-2 py-0.5 text-[11px] text-[var(--t2)] border border-[var(--b2)]">
                    <GraduationCap size={12} strokeWidth={1.75} className="text-[var(--t3)]" />
                    {profile.major}
                  </span>
                )}
                {profile?.institution && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-[var(--s2)] px-2 py-0.5 text-[11px] text-[var(--t2)] border border-[var(--b2)]">
                    <Building2 size={12} strokeWidth={1.75} className="text-[var(--t3)]" />
                    {profile.institution}
                  </span>
                )}
                {profile?.graduation_year && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-[var(--s2)] px-2 py-0.5 text-[11px] text-[var(--t2)] border border-[var(--b2)]">
                    <Calendar size={12} strokeWidth={1.75} className="text-[var(--t3)]" />
                    '{profile.graduation_year.slice(-2)}
                  </span>
                )}
              </div>

              {profile?.study_goal && (
                <div className="mt-2.5 flex items-start gap-1.5 text-xs text-[var(--t2)]">
                  <Target size={13} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[var(--t3)]" />
                  <span>{profile.study_goal}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Study Stats ───────────────────────────────────────────────────── */}
      <div className="mb-6">
        <p className="mb-2 text-[11px] font-semibold tracking-wider uppercase text-[var(--t3)]">
          Study Activity & Momentum
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
          <StatCard
            icon={FileText}
            label="Documents"
            value={profile?.stats.documents ?? 0}
          />
          <StatCard
            icon={MessageSquare}
            label="Conversations"
            value={profile?.stats.conversations ?? 0}
          />
          <StatCard
            icon={Layers}
            label="Flashcards"
            value={profile?.stats.flashcards ?? 0}
          />
          <StatCard
            icon={ClipboardCheck}
            label="Quizzes"
            value={profile?.stats.quizzes ?? 0}
          />
          <StatCard
            icon={CheckCircle2}
            label="Tasks Completed"
            value={profile?.stats.planner_completed ?? 0}
          />
          <StatCard
            icon={Flame}
            label="Exams Ahead"
            value={profile?.stats.upcoming_exams ?? 0}
            isHighlight={!!(profile?.stats.upcoming_exams && profile.stats.upcoming_exams > 0)}
          />
        </div>
      </div>

      {/* ── Appearance ────────────────────────────────────────────────────── */}
      <Section title="Appearance">
        <Row
          noBorder
          label="Theme"
          value={theme === "dark" ? "Dark Mode" : "Light Mode"}
          action={
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
              className="btn-primary py-1 px-3 text-xs"
            >
              {theme === "dark" ? (
                <>
                  <Sun size={13} strokeWidth={1.75} className="text-[var(--t2)]" /> Switch to light
                </>
              ) : (
                <>
                  <Moon size={13} strokeWidth={1.75} className="text-[var(--t2)]" /> Switch to dark
                </>
              )}
            </button>
          }
        />
      </Section>

      {/* ── Account ───────────────────────────────────────────────────────── */}
      <Section title="Account">
        <Row noBorder label="Email Address" value={profile?.email} />
        <Row
          label="Sign out"
          action={<LogOut size={14} className="text-[var(--t3)]" strokeWidth={1.75} />}
          onClick={async () => {
            await createClient().auth.signOut();
            router.push("/");
          }}
        />
      </Section>

      {/* ── Data & Privacy ────────────────────────────────────────────────── */}
      <Section title="Data & Privacy">
        <Row
          noBorder
          label="Clear all conversations"
          action={<Trash2 size={14} className="text-[var(--t3)]" strokeWidth={1.75} />}
          onClick={() => setModal("clear-chats")}
        />
        <Row
          label="Sign out session"
          danger
          action={<Trash2 size={14} className="text-red-500" strokeWidth={1.75} />}
          onClick={() => setModal("delete-account")}
        />
      </Section>

      <p className="mt-8 text-center text-xs text-[var(--t3)] flex items-center justify-center gap-1">
        <Sparkles size={12} className="text-[var(--t3)]" /> Cognera · Built for university students worldwide
      </p>
    </div>
  );
}
