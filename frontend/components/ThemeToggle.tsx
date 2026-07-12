"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

export default function ThemeToggle({
  collapsed,
  iconOnly = false,
}: {
  collapsed?: boolean;
  iconOnly?: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const isDark = theme === "dark";
  const showLabel = !collapsed && !iconOnly;

  // Icon-only variant — used in the mobile top bar
  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: "34px", height: "34px",
          background: "transparent", border: "none",
          borderRadius: "8px", cursor: "pointer",
          color: "var(--t2)", transition: "color 0.15s, background 0.15s",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = "var(--s2)";
          e.currentTarget.style.color = "var(--t1)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--t2)";
        }}
      >
        {isDark
          ? <Sun size={17} strokeWidth={1.75} />
          : <Moon size={17} strokeWidth={1.75} />}
      </button>
    );
  }

  // Full variant — used in sidebar footer
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm w-full transition-colors"
      style={{ color: "var(--t2)", background: "transparent", border: "none", cursor: "pointer" }}
      onMouseEnter={e => {
        e.currentTarget.style.background = "var(--s2)";
        e.currentTarget.style.color = "var(--t1)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--t2)";
      }}
    >
      {isDark
        ? <Sun size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
        : <Moon size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />}
      {showLabel && <span>{isDark ? "Light mode" : "Dark mode"}</span>}
    </button>
  );
}
