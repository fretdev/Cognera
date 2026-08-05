"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  Play,
  Pause,
  RotateCcw,
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  BookOpen,
  AlertCircle,
  X,
  Flame,
  Check,
  Tag,
  Layers,
  Sparkles,
} from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";

export type PlannerCategory = "exam" | "assignment" | "study_session";

export interface PlannerItem {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: PlannerCategory;
  target_timestamp: string | null;
  duration_minutes: number;
  is_completed: boolean;
  created_at: string;
}

/* ── Web Audio Chime Generator ────────────────────────────────────────────── */
function playCompletionChime() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(523.25, now);
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.6);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(659.25, now + 0.25);
    gain2.gain.setValueAtTime(0.4, now + 0.25);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.25);
    osc2.stop(now + 1.2);

    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = "sine";
    osc3.frequency.setValueAtTime(783.99, now + 0.5);
    gain3.gain.setValueAtTime(0.5, now + 0.5);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now + 0.5);
    osc3.stop(now + 1.8);
  } catch (err) {
    console.warn("AudioContext chime error:", err);
  }
}

/* ── Helper to format time remaining for countdowns ────────────────────────── */
function formatCountdown(targetStr: string | null): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isPast: boolean;
  totalSecs: number;
} {
  if (!targetStr) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true, totalSecs: 0 };
  }
  const target = new Date(targetStr).getTime();
  const now = new Date().getTime();
  const diff = target - now;

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true, totalSecs: 0 };
  }

  const totalSecs = Math.floor(diff / 1000);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds, isPast: false, totalSecs };
}

export default function PlannerPanel() {
  const [items, setItems] = useState<PlannerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Controls
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  // Sound & Alarm Toggles
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [desktopNotificationsEnabled, setDesktopNotificationsEnabled] = useState(true);

  // Form State
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState<PlannerCategory>("exam");
  const [formTargetDate, setFormTargetDate] = useState("");
  const [formDuration, setFormDuration] = useState("30");
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Pomodoro / Active Session State
  const [activeItem, setActiveItem] = useState<PlannerItem | null>(null);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number>(25 * 60);
  const [timerTotalDuration, setTimerTotalDuration] = useState<number>(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");

  // Live Tick State
  const [, setTick] = useState(0);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiGet<PlannerItem[]>("/planner");
      setItems(data);
    } catch (err: unknown) {
      console.error("Failed to load planner items:", err);
      setError(err instanceof Error ? err.message : "Failed to load study planner items.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(Notification.permission);
    } else {
      setNotificationPermission("unsupported");
    }
  }, []);

  const toggleNotificationAccess = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        const nextState = !desktopNotificationsEnabled;
        setDesktopNotificationsEnabled(nextState);
        setSoundEnabled(nextState);
      } else if (Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        if (permission === "granted") {
          setDesktopNotificationsEnabled(true);
          setSoundEnabled(true);
        }
      } else {
        alert("Notifications are currently blocked in your browser settings.");
      }
    } else {
      const nextState = !soundEnabled;
      setSoundEnabled(nextState);
      setDesktopNotificationsEnabled(nextState);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isTimerRunning && timerSecondsLeft > 0) {
      interval = setInterval(() => {
        setTimerSecondsLeft((prev) => prev - 1);
      }, 1000);
    } else if (isTimerRunning && timerSecondsLeft === 0) {
      setIsTimerRunning(false);

      if (soundEnabled && desktopNotificationsEnabled) {
        playCompletionChime();
      }

      if (
        desktopNotificationsEnabled &&
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        new Notification("Focus Session Complete! 🎉", {
          body: activeItem
            ? `Great job! You finished your session: "${activeItem.title}".`
            : "Your focus study block has completed!",
          icon: "/favicon.ico",
        });
      }

      setShowCompletionModal(true);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, timerSecondsLeft, activeItem, soundEnabled, desktopNotificationsEnabled]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    try {
      setFormSubmitting(true);
      const isExamCategory = formCategory === "exam";
      const payload = {
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        category: formCategory,
        target_timestamp: formTargetDate ? new Date(formTargetDate).toISOString() : undefined,
        duration_minutes: isExamCategory ? 0 : parseInt(formDuration, 10) || 30,
      };

      const newItem = await apiPost<PlannerItem>("/planner", payload);
      setItems((prev) => [newItem, ...prev]);

      setFormTitle("");
      setFormDescription("");
      setFormCategory("exam");
      setFormTargetDate("");
      setFormDuration("30");
      setShowAddModal(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleToggleComplete = async (item: PlannerItem) => {
    const updatedStatus = !item.is_completed;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_completed: updatedStatus } : i))
    );

    try {
      await apiPatch<PlannerItem>(`/planner/${item.id}`, {
        is_completed: updatedStatus,
      });
    } catch (err) {
      console.error("Failed to toggle completion status:", err);
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_completed: item.is_completed } : i))
      );
    }
  };

  const handleDeleteItem = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (activeItem?.id === id) {
      setIsTimerRunning(false);
      setActiveItem(null);
    }

    try {
      await apiDelete(`/planner/${id}`);
    } catch (err) {
      console.error("Failed to delete planner item:", err);
      fetchItems();
    }
  };

  const handleStartStudySession = (item: PlannerItem) => {
    setActiveItem(item);
    const secs = (item.duration_minutes || 25) * 60;
    setTimerTotalDuration(secs);
    setTimerSecondsLeft(secs);
    setIsTimerRunning(true);
  };

  const handleCustomPomodoro = (minutes: number) => {
    setActiveItem(null);
    const secs = minutes * 60;
    setTimerTotalDuration(secs);
    setTimerSecondsLeft(secs);
    setIsTimerRunning(false);
  };

  const handleCompleteCurrentActiveSession = () => {
    setShowCompletionModal(false);
    if (activeItem) {
      handleToggleComplete(activeItem);
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesCategory =
        categoryFilter === "all" || item.category === categoryFilter;
      const matchesSearch =
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description &&
          item.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [items, categoryFilter, searchQuery]);

  const examCountdowns = useMemo(() => {
    return items
      .filter((i) => i.category === "exam" && i.target_timestamp && !i.is_completed)
      .sort((a, b) => {
        const timeA = new Date(a.target_timestamp!).getTime();
        const timeB = new Date(b.target_timestamp!).getTime();
        return timeA - timeB;
      });
  }, [items]);

  const stats = useMemo(() => {
    const total = items.length;
    const completed = items.filter((i) => i.is_completed).length;
    const exams = items.filter((i) => i.category === "exam" && !i.is_completed).length;
    const studyBlocks = items.filter((i) => i.category === "study_session" && !i.is_completed).length;
    return { total, completed, exams, studyBlocks };
  }, [items]);

  const progressPercent = useMemo(() => {
    if (timerTotalDuration === 0) return 0;
    return Math.min(
      100,
      Math.max(0, ((timerTotalDuration - timerSecondsLeft) / timerTotalDuration) * 100)
    );
  }, [timerSecondsLeft, timerTotalDuration]);

  const timerFormatted = useMemo(() => {
    const mins = Math.floor(timerSecondsLeft / 60);
    const secs = timerSecondsLeft % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }, [timerSecondsLeft]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-medium text-[var(--t1)] sm:text-2xl">Study Planner</h1>
          <p className="mt-1 text-xs text-[var(--t2)] sm:text-sm">
            Organize exam countdowns, study sessions, and timed focus blocks.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={toggleNotificationAccess}
            className="btn-primary text-xs py-1.5 px-3"
            title="Toggle desktop popup notifications"
          >
            {desktopNotificationsEnabled && soundEnabled ? (
              <>
                <Bell size={13} strokeWidth={1.75} className="text-[var(--accent)]" />
                <span>Alarms On</span>
              </>
            ) : (
              <>
                <BellOff size={13} strokeWidth={1.75} />
                <span>Alarms Off</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="btn-primary text-xs py-1.5 px-3.5 bg-[var(--accent)] text-white hover:opacity-90 shadow-sm"
          >
            <Plus size={14} strokeWidth={2} />
            <span>Add Task</span>
          </button>
        </div>
      </div>

      {/* ── Minimal Metric Stat Cards ─────────────────────────────────────── */}
      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
        <div
          className="rounded-2xl p-3.5 transition-colors sm:p-4"
          style={{ background: "var(--s1)", border: "1px solid var(--b1)", boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center justify-between text-[var(--t3)]">
            <span className="text-xs font-medium">Total Tasks</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--s2)] border border-[var(--b2)]">
              <Layers size={13} strokeWidth={1.75} className="text-[var(--t2)]" />
            </div>
          </div>
          <div className="mt-1 text-lg font-semibold text-[var(--t1)] sm:text-xl">{stats.total}</div>
        </div>

        <div
          className="rounded-2xl p-3.5 transition-colors sm:p-4"
          style={{ background: "var(--s1)", border: "1px solid var(--b1)", boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center justify-between text-[var(--t3)]">
            <span className="text-xs font-medium">Exams Ahead</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[rgba(241,115,0,0.12)] border border-[rgba(241,115,0,0.25)]">
              <Flame size={13} strokeWidth={1.75} className="text-[#F17300]" />
            </div>
          </div>
          <div className="mt-1 text-lg font-semibold text-[var(--t1)] sm:text-xl">{stats.exams}</div>
        </div>

        <div
          className="rounded-2xl p-3.5 transition-colors sm:p-4"
          style={{ background: "var(--s1)", border: "1px solid var(--b1)", boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center justify-between text-[var(--t3)]">
            <span className="text-xs font-medium">Sessions</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[rgba(16,185,129,0.12)] border border-[rgba(16,185,129,0.25)]">
              <Clock size={13} strokeWidth={1.75} className="text-[#34D399]" />
            </div>
          </div>
          <div className="mt-1 text-lg font-semibold text-[var(--t1)] sm:text-xl">{stats.studyBlocks}</div>
        </div>

        <div
          className="rounded-2xl p-3.5 transition-colors sm:p-4"
          style={{ background: "var(--s1)", border: "1px solid var(--b1)", boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center justify-between text-[var(--t3)]">
            <span className="text-xs font-medium">Completed</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[rgba(99,102,241,0.12)] border border-[rgba(99,102,241,0.25)]">
              <CheckCircle2 size={13} strokeWidth={1.75} className="text-[#818CF8]" />
            </div>
          </div>
          <div className="mt-1 text-lg font-semibold text-[var(--t1)] sm:text-xl">{stats.completed}</div>
        </div>
      </div>

      {/* ── Upcoming Exam Reminders ────────────────────────────────────────── */}
      {examCountdowns.length > 0 && (
        <div className="mt-6 sm:mt-8">
          <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--t3)]">
            Upcoming Exam Reminders
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {examCountdowns.map((exam) => {
              const cd = formatCountdown(exam.target_timestamp);

              return (
                <div
                  key={exam.id}
                  className="rounded-2xl p-4 flex flex-col justify-between transition-all hover:border-[var(--b2)]"
                  style={{
                    background: "var(--s1)",
                    border: "1px solid var(--b1)",
                    boxShadow: "var(--card-shadow)",
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 pr-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-[rgba(241,115,0,0.10)] px-2 py-0.5 text-[10px] font-semibold text-[#F17300] border border-[rgba(241,115,0,0.20)] uppercase tracking-wider">
                        <Flame size={10} className="text-[#F17300]" /> Exam
                      </span>
                      <h3 className="mt-1.5 text-sm font-medium text-[var(--t1)] truncate">
                        {exam.title}
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleComplete(exam)}
                      className="text-xs font-medium text-[var(--t2)] hover:text-[#F17300] shrink-0 transition-colors"
                    >
                      Done
                    </button>
                  </div>

                  <div className="mt-3.5 grid grid-cols-4 gap-1 text-center">
                    <div className="rounded-xl bg-[var(--s2)] py-1.5 border border-[var(--b1)]">
                      <div className="text-sm font-semibold text-[var(--t1)] sm:text-base">{cd.days}</div>
                      <div className="text-[9px] text-[var(--t3)] uppercase">Days</div>
                    </div>
                    <div className="rounded-xl bg-[var(--s2)] py-1.5 border border-[var(--b1)]">
                      <div className="text-sm font-semibold text-[var(--t1)] sm:text-base">{cd.hours}</div>
                      <div className="text-[9px] text-[var(--t3)] uppercase">Hrs</div>
                    </div>
                    <div className="rounded-xl bg-[var(--s2)] py-1.5 border border-[var(--b1)]">
                      <div className="text-sm font-semibold text-[var(--t1)] sm:text-base">{cd.minutes}</div>
                      <div className="text-[9px] text-[var(--t3)] uppercase">Mins</div>
                    </div>
                    <div className="rounded-xl bg-[var(--s2)] py-1.5 border border-[var(--b1)]">
                      <div className="text-sm font-semibold text-[#F17300] sm:text-base">{cd.seconds}</div>
                      <div className="text-[9px] text-[var(--t3)] uppercase">Secs</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Main Layout: Pomodoro Timer + Task List ──────────────────────── */}
      <div className="mt-6 grid gap-6 sm:mt-8 lg:grid-cols-12">
        {/* Left: Pomodoro Timer (5 cols) */}
        <div className="lg:col-span-5">
          <div
            className="rounded-2xl p-5 shadow-sm sm:p-6"
            style={{
              background: "var(--s1)",
              border: "1px solid var(--b1)",
              boxShadow: "var(--card-shadow)",
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={16} strokeWidth={1.75} className="text-[var(--accent)]" />
                <h3 className="text-sm font-medium text-[var(--t1)]">Focus Timer</h3>
              </div>

              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="text-xs text-[var(--t3)] hover:text-[var(--t1)]"
              >
                {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
              </button>
            </div>

            {/* Selected Task Target */}
            <div className="mt-3.5 rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-xs flex items-center justify-between border border-[var(--accent-border)]">
              <span className="text-[var(--accent)] font-medium truncate">
                Target: {activeItem ? activeItem.title : "Custom Focus"}
              </span>
              {activeItem && (
                <button
                  type="button"
                  onClick={() => setActiveItem(null)}
                  className="text-[var(--accent)] hover:opacity-80"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Presets */}
            <div className="mt-3.5 flex flex-wrap justify-center gap-1.5">
              {[15, 25, 45, 60].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleCustomPomodoro(m)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    timerTotalDuration === m * 60
                      ? "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)]"
                      : "bg-[var(--s2)] text-[var(--t3)] hover:text-[var(--t1)] border border-transparent"
                  }`}
                >
                  {m}m
                </button>
              ))}
            </div>

            {/* Circular Timer Ring */}
            <div className="my-5 flex justify-center">
              <div className="relative flex h-36 w-36 sm:h-44 sm:w-44 items-center justify-center">
                <svg className="h-full w-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    className="stroke-[var(--b2)] fill-none"
                    strokeWidth="4"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    className="stroke-[var(--accent)] fill-none transition-all duration-1000 ease-linear"
                    strokeWidth="4"
                    strokeDasharray="263.89"
                    strokeDashoffset={263.89 - (263.89 * progressPercent) / 100}
                    strokeLinecap="round"
                  />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-mono text-2xl font-semibold tracking-tight text-[var(--t1)] sm:text-3xl">
                    {timerFormatted}
                  </span>
                  <span className="mt-0.5 text-[10px] text-[var(--t3)] uppercase tracking-wider font-medium">
                    {isTimerRunning ? "Focusing" : "Paused"}
                  </span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setIsTimerRunning(!isTimerRunning)}
                className="btn-primary py-2 px-5 bg-[var(--accent)] text-white hover:opacity-90 text-xs font-medium shadow-sm"
              >
                {isTimerRunning ? (
                  <>
                    <Pause size={14} /> Pause
                  </>
                ) : (
                  <>
                    <Play size={14} /> Start
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsTimerRunning(false);
                  setTimerSecondsLeft(timerTotalDuration);
                }}
                className="btn-primary py-2 px-3 text-xs"
                title="Reset Timer"
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Right: Task List (7 cols) */}
        <div className="lg:col-span-7">
          <div
            className="rounded-2xl p-5 shadow-sm sm:p-6"
            style={{
              background: "var(--s1)",
              border: "1px solid var(--b1)",
              boxShadow: "var(--card-shadow)",
            }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-medium text-[var(--t1)]">Study Tasks</h2>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Search…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-32 rounded-xl border border-[var(--b2)] bg-[var(--s2)] px-3 py-1 text-xs text-[var(--t1)] outline-none focus:border-[var(--accent)]"
                />

                <div className="flex flex-wrap rounded-full border border-[var(--b2)] bg-[var(--s2)] p-0.5 text-xs">
                  {["all", "exam", "assignment", "study_session"].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat)}
                      className={`rounded-full px-2.5 py-1 text-[11px] capitalize transition-colors ${
                        categoryFilter === cat
                          ? "bg-[var(--s1)] text-[var(--t1)] shadow-xs font-medium"
                          : "text-[var(--t3)] hover:text-[var(--t1)]"
                      }`}
                    >
                      {cat === "study_session" ? "session" : cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-500/10 p-3 text-xs text-red-500">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            {loading && <p className="mt-8 text-center text-xs text-[var(--t3)]">Loading tasks…</p>}

            {!loading && filteredItems.length === 0 && (
              <div className="my-10 text-center">
                <BookOpen className="mx-auto h-8 w-8 text-[var(--t3)]" />
                <h3 className="mt-2 text-sm font-medium text-[var(--t1)]">No study tasks</h3>
                <p className="mt-1 text-xs text-[var(--t3)]">
                  Add an upcoming exam countdown, assignment, or study block.
                </p>
              </div>
            )}

            {!loading && filteredItems.length > 0 && (
              <div className="mt-4 space-y-2">
                {filteredItems.map((item) => {
                  const isExam = item.category === "exam";
                  const isAssignment = item.category === "assignment";
                  const isSession = item.category === "study_session";

                  return (
                    <div
                      key={item.id}
                      className={`group flex items-start gap-3 rounded-xl border p-3 sm:p-3.5 transition-colors ${
                        item.is_completed
                          ? "border-[var(--b1)] bg-[var(--s2)]/40 opacity-60"
                          : "border-[var(--b1)] bg-[var(--s2)] hover:border-[var(--b2)]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleComplete(item)}
                        className="mt-0.5 text-[var(--t3)] hover:text-[var(--accent)] shrink-0 transition-colors"
                      >
                        {item.is_completed ? (
                          <CheckCircle2 size={18} className="text-[var(--accent)]" />
                        ) : (
                          <Circle size={18} />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4
                            className={`text-sm font-medium text-[var(--t1)] ${
                              item.is_completed ? "line-through text-[var(--t3)]" : ""
                            }`}
                          >
                            {item.title}
                          </h4>

                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                              isExam
                                ? "bg-[rgba(241,115,0,0.10)] text-[#F17300] border border-[rgba(241,115,0,0.20)]"
                                : isAssignment
                                ? "bg-[rgba(99,102,241,0.10)] text-[#818CF8] border border-[rgba(99,102,241,0.20)]"
                                : "bg-[rgba(16,185,129,0.10)] text-[#34D399] border border-[rgba(16,185,129,0.20)]"
                            }`}
                          >
                            {isExam && <Flame size={10} className="text-[#F17300]" />}
                            {isAssignment && <Tag size={10} className="text-[#818CF8]" />}
                            {isSession && <Clock size={10} className="text-[#34D399]" />}
                            {item.category.replace("_", " ")}
                          </span>
                        </div>

                        {item.description && (
                          <p className="mt-1 text-xs text-[var(--t2)] line-clamp-2">
                            {item.description}
                          </p>
                        )}

                        <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--t3)] flex-wrap">
                          {item.target_timestamp && (
                            <span className="flex items-center gap-1">
                              <Calendar size={12} />
                              {new Date(item.target_timestamp).toLocaleString([], {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </span>
                          )}

                          {item.duration_minutes > 0 && (
                            <span className="flex items-center gap-1">
                              <Clock size={12} />
                              {item.duration_minutes}m
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {!item.is_completed && !isExam && (
                          <button
                            type="button"
                            onClick={() => handleStartStudySession(item)}
                            className="rounded-md p-1.5 text-[var(--accent)] bg-[var(--accent-soft)] hover:bg-[var(--accent)] hover:text-white transition-colors border border-[var(--accent-border)]"
                            title="Start study timer"
                          >
                            <Play size={14} />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          className="rounded-md p-1.5 text-[var(--t3)] hover:text-red-500 transition-colors"
                          title="Delete item"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal: Add New Task ───────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div
            className="w-full max-w-sm rounded-2xl p-5 shadow-xl sm:p-6"
            style={{ background: "var(--s1)", border: "1px solid var(--b2)" }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-[var(--accent)]" />
                <h3 className="text-sm font-medium text-[var(--t1)]">Add Study Task</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-[var(--t3)] hover:text-[var(--t1)]"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddItem} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs text-[var(--t3)] mb-1">Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Midterm Organic Chemistry Exam"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full rounded-xl border border-[var(--b2)] bg-[var(--s2)] px-3 py-1.5 text-xs text-[var(--t1)] outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className={`grid gap-2 ${formCategory === "exam" ? "grid-cols-1" : "grid-cols-2"}`}>
                <div>
                  <label className="block text-xs text-[var(--t3)] mb-1">Category</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as PlannerCategory)}
                    className="w-full rounded-xl border border-[var(--b2)] bg-[var(--s2)] px-3 py-1.5 text-xs text-[var(--t1)] outline-none focus:border-[var(--accent)]"
                  >
                    <option value="exam">Exam Countdown</option>
                    <option value="assignment">Assignment</option>
                    <option value="study_session">Study Session</option>
                  </select>
                </div>

                {formCategory !== "exam" && (
                  <div>
                    <label className="block text-xs text-[var(--t3)] mb-1">Duration (mins)</label>
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      value={formDuration}
                      onChange={(e) => setFormDuration(e.target.value)}
                      className="w-full rounded-xl border border-[var(--b2)] bg-[var(--s2)] px-3 py-1.5 text-xs text-[var(--t1)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs text-[var(--t3)] mb-1">
                  {formCategory === "exam" ? "Exam Date & Time *" : "Target Date (Optional)"}
                </label>
                <input
                  type="datetime-local"
                  required={formCategory === "exam"}
                  value={formTargetDate}
                  onChange={(e) => setFormTargetDate(e.target.value)}
                  className="w-full rounded-xl border border-[var(--b2)] bg-[var(--s2)] px-3 py-1.5 text-xs text-[var(--t1)] outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div>
                <label className="block text-xs text-[var(--t3)] mb-1">Notes (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Chapters 4-8, room number..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full rounded-xl border border-[var(--b2)] bg-[var(--s2)] px-3 py-1.5 text-xs text-[var(--t1)] outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-primary text-xs py-1.5 px-3"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="btn-primary text-xs py-1.5 px-3 bg-[var(--accent)] text-white hover:opacity-90 shadow-sm"
                >
                  {formSubmitting ? "Saving…" : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Completion Alarm ──────────────────────────────────────── */}
      {showCompletionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div
            className="w-full max-w-sm rounded-2xl p-6 text-center shadow-xl"
            style={{ background: "var(--s1)", border: "1px solid var(--b2)" }}
          >
            <h3 className="text-base font-medium text-[var(--t1)]">Session Complete!</h3>
            <p className="mt-1 text-xs text-[var(--t2)]">
              {activeItem
                ? `You finished your focus block for "${activeItem.title}".`
                : "Great job focusing during your study block."}
            </p>

            <div className="mt-5 flex flex-col gap-2">
              {activeItem && !activeItem.is_completed && (
                <button
                  type="button"
                  onClick={handleCompleteCurrentActiveSession}
                  className="btn-primary w-full justify-center bg-[var(--accent)] text-white hover:opacity-90 py-2 text-xs shadow-sm"
                >
                  <Check size={14} /> Mark Task as Completed
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowCompletionModal(false)}
                className="btn-primary w-full justify-center py-2 text-xs"
              >
                Dismiss Alarm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
