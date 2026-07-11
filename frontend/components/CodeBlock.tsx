"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export default function CodeBlock({
  language,
  children,
}: {
  language?: string;
  children: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="my-3 overflow-hidden rounded-xl"
      style={{ border: "1px solid var(--b2)" }}>
      {/* Header — always dark regardless of theme, like VS Code */}
      <div className="flex items-center justify-between px-4 py-2.5"
        style={{ background: "#1A1A1F", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: "11.5px",
          color: "rgba(255,255,255,0.35)",
          letterSpacing: "0.03em",
        }}>
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code"
          style={{
            display: "flex", alignItems: "center", gap: "5px",
            fontSize: "12px", color: copied ? "#3ECF8E" : "rgba(255,255,255,0.35)",
            background: "none", border: "none", cursor: "pointer",
            transition: "color 0.15s",
          }}
          onMouseEnter={e => { if (!copied) (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.7)"; }}
          onMouseLeave={e => { if (!copied) (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.35)"; }}
        >
          {copied
            ? <><Check size={12} strokeWidth={2.5} />Copied</>
            : <><Copy size={12} strokeWidth={1.75} />Copy</>}
        </button>
      </div>
      {/* Code body — always dark, exact VSCode dark+ palette */}
      <pre style={{
        background: "#0D0D10",
        padding: "16px",
        overflowX: "auto",
        margin: 0,
        fontSize: "13px",
        lineHeight: "1.65",
        color: "#E0E0E8",
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      }}>
        <code>{children}</code>
      </pre>
    </div>
  );
}
