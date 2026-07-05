import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg:      "var(--bg)",
        s1:      "var(--surface-1)",
        s2:      "var(--surface-2)",
        s3:      "var(--surface-3)",
        b1:      "var(--border-1)",
        b2:      "var(--border-2)",
        b3:      "var(--border-3)",
        t1:      "var(--text-1)",
        t2:      "var(--text-2)",
        t3:      "var(--text-3)",
        accent:  "var(--accent)",
        // Legacy compat aliases
        surface: "var(--surface-2)",
        border:  "var(--border-2)",
        ink:     "var(--text-1)",
        muted:   "var(--text-2)",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        sans:    ["var(--font-sans)", "sans-serif"],
        mono:    ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
