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
    <div className="my-3 overflow-hidden rounded-xl border border-border">
      <div className="flex items-center justify-between bg-[#1a1b1c] px-4 py-2">
        <span className="font-mono text-xs text-muted">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code"
          className="flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-ink"
        >
          {copied ? (
            <Check size={13} strokeWidth={2} />
          ) : (
            <Copy size={13} strokeWidth={1.75} />
          )}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto bg-[#0d0d0e] px-4 py-3 text-sm leading-relaxed text-[#e3e3e3]">
        <code className="font-mono">{children}</code>
      </pre>
    </div>
  );
}
