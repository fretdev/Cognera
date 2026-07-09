"use client";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

export default function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm w-full transition-colors"
      style={{ color: "var(--t2)" }}
      onMouseEnter={e => { e.currentTarget.style.background = "var(--s2)"; e.currentTarget.style.color = "var(--t1)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--t2)"; }}
    >
      {isDark
        ? <Sun size={15} strokeWidth={1.75} className="flex-shrink-0" />
        : <Moon size={15} strokeWidth={1.75} className="flex-shrink-0" />
      }
      {!collapsed && <span>{isDark ? "Light mode" : "Dark mode"}</span>}
    </button>
  );
}
