import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // New token names
        bg:     "var(--bg)",
        s1:     "var(--s1)",
        s2:     "var(--s2)",
        s3:     "var(--s3)",
        s4:     "var(--s4)",
        b1:     "var(--b1)",
        b2:     "var(--b2)",
        b3:     "var(--b3)",
        t1:     "var(--t1)",
        t2:     "var(--t2)",
        t3:     "var(--t3)",
        accent: "var(--accent)",
        // Legacy aliases — keep these so old Tailwind classes still work
        surface:  "var(--s1)",
        border:   "var(--b2)",
        ink:      "var(--t1)",
        muted:    "var(--t2)",
      },
      fontFamily: {
        display: ["var(--font-display)", "Plus Jakarta Sans", "sans-serif"],
        sans:    ["var(--font-sans)", "Inter", "sans-serif"],
        mono:    ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
