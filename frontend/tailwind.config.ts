import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        border: "var(--border)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-soft": "var(--accent-soft)",
      },
      fontFamily: {
        sans: [
          '"Google Sans"',
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      fontSize: {
        // fluid type scale
        xs: ["clamp(0.72rem, 0.7rem + 0.1vw, 0.78rem)", { lineHeight: "1.4" }],
        sm: ["clamp(0.825rem, 0.8rem + 0.15vw, 0.9rem)", { lineHeight: "1.5" }],
        base: ["clamp(0.925rem, 0.9rem + 0.2vw, 1rem)", { lineHeight: "1.6" }],
        lg: ["clamp(1.05rem, 1rem + 0.3vw, 1.2rem)", { lineHeight: "1.5" }],
        xl: ["clamp(1.2rem, 1.1rem + 0.5vw, 1.5rem)", { lineHeight: "1.4" }],
        "2xl": ["clamp(1.5rem, 1.3rem + 1vw, 2rem)", { lineHeight: "1.25" }],
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
