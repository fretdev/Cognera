"use client";

/**
 * CodeBlock — syntax-highlighted code with VS Code Dark+ colours.
 *
 * Uses react-syntax-highlighter with the Prism engine because Prism's
 * tokeniser is the same one VS Code uses under the hood (TextMate grammars),
 * so the colours match what a developer's muscle memory expects from their IDE.
 *
 * Language detection strategy (in order):
 *   1. Exact match in LANG_MAP (handles every alias Gemini writes)
 *   2. Raw string passed straight to Prism (it accepts many itself)
 *   3. Empty string → Prism tries its own auto-detect heuristic
 *
 * We never fall back to "text" because that strips ALL highlighting —
 * partial highlighting of an unknown language is always better than none.
 */

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

// ── Explicit language imports ─────────────────────────────────────────────
// PrismLight ships with zero languages by default — each one is imported
// individually so the bundle only includes what we actually need, keeping
// the initial page load fast while still covering every common language.
import javascript  from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import typescript  from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import jsx         from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import tsx         from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import python      from "react-syntax-highlighter/dist/esm/languages/prism/python";
import java        from "react-syntax-highlighter/dist/esm/languages/prism/java";
import kotlin      from "react-syntax-highlighter/dist/esm/languages/prism/kotlin";
import swift       from "react-syntax-highlighter/dist/esm/languages/prism/swift";
import c           from "react-syntax-highlighter/dist/esm/languages/prism/c";
import cpp         from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import csharp      from "react-syntax-highlighter/dist/esm/languages/prism/csharp";
import go          from "react-syntax-highlighter/dist/esm/languages/prism/go";
import rust        from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import ruby        from "react-syntax-highlighter/dist/esm/languages/prism/ruby";
import php         from "react-syntax-highlighter/dist/esm/languages/prism/php";
import scala       from "react-syntax-highlighter/dist/esm/languages/prism/scala";
import dart        from "react-syntax-highlighter/dist/esm/languages/prism/dart";
import r           from "react-syntax-highlighter/dist/esm/languages/prism/r";
import matlab      from "react-syntax-highlighter/dist/esm/languages/prism/matlab";
import sql         from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import bash        from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import powershell  from "react-syntax-highlighter/dist/esm/languages/prism/powershell";
import html        from "react-syntax-highlighter/dist/esm/languages/prism/markup"; // html = markup in Prism
import css         from "react-syntax-highlighter/dist/esm/languages/prism/css";
import scss        from "react-syntax-highlighter/dist/esm/languages/prism/scss";
import json        from "react-syntax-highlighter/dist/esm/languages/prism/json";
import yaml        from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import toml        from "react-syntax-highlighter/dist/esm/languages/prism/toml";
import graphql     from "react-syntax-highlighter/dist/esm/languages/prism/graphql";
import docker      from "react-syntax-highlighter/dist/esm/languages/prism/docker";
import markdown    from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import xml         from "react-syntax-highlighter/dist/esm/languages/prism/markup";

// Register every language with PrismLight
SyntaxHighlighter.registerLanguage("javascript",  javascript);
SyntaxHighlighter.registerLanguage("typescript",  typescript);
SyntaxHighlighter.registerLanguage("jsx",         jsx);
SyntaxHighlighter.registerLanguage("tsx",         tsx);
SyntaxHighlighter.registerLanguage("python",      python);
SyntaxHighlighter.registerLanguage("java",        java);
SyntaxHighlighter.registerLanguage("kotlin",      kotlin);
SyntaxHighlighter.registerLanguage("swift",       swift);
SyntaxHighlighter.registerLanguage("c",           c);
SyntaxHighlighter.registerLanguage("cpp",         cpp);
SyntaxHighlighter.registerLanguage("csharp",      csharp);
SyntaxHighlighter.registerLanguage("go",          go);
SyntaxHighlighter.registerLanguage("rust",        rust);
SyntaxHighlighter.registerLanguage("ruby",        ruby);
SyntaxHighlighter.registerLanguage("php",         php);
SyntaxHighlighter.registerLanguage("scala",       scala);
SyntaxHighlighter.registerLanguage("dart",        dart);
SyntaxHighlighter.registerLanguage("r",           r);
SyntaxHighlighter.registerLanguage("matlab",      matlab);
SyntaxHighlighter.registerLanguage("sql",         sql);
SyntaxHighlighter.registerLanguage("bash",        bash);
SyntaxHighlighter.registerLanguage("shell",       bash); // alias
SyntaxHighlighter.registerLanguage("powershell",  powershell);
SyntaxHighlighter.registerLanguage("html",        html);
SyntaxHighlighter.registerLanguage("markup",      html);
SyntaxHighlighter.registerLanguage("xml",         xml);
SyntaxHighlighter.registerLanguage("css",         css);
SyntaxHighlighter.registerLanguage("scss",        scss);
SyntaxHighlighter.registerLanguage("json",        json);
SyntaxHighlighter.registerLanguage("yaml",        yaml);
SyntaxHighlighter.registerLanguage("toml",        toml);
SyntaxHighlighter.registerLanguage("graphql",     graphql);
SyntaxHighlighter.registerLanguage("docker",      docker);
SyntaxHighlighter.registerLanguage("dockerfile",  docker);
SyntaxHighlighter.registerLanguage("markdown",    markdown);

// ── Language alias map ────────────────────────────────────────────────────
// Maps every shorthand/variant Gemini might write in a code fence to the
// exact string we registered above. Case-insensitive (we toLowerCase before lookup).
const LANG_MAP: Record<string, string> = {
  // JavaScript / TypeScript
  js: "javascript", javascript: "javascript",
  ts: "typescript", typescript: "typescript",
  jsx: "jsx", tsx: "tsx",
  mjs: "javascript", cjs: "javascript",
  node: "javascript", nodejs: "javascript",

  // Python
  py: "python", python: "python", python3: "python", py3: "python",

  // JVM
  java: "java",
  kt: "kotlin", kotlin: "kotlin",
  scala: "scala",
  groovy: "java", // close enough

  // Apple
  swift: "swift",
  objc: "c", objectivec: "c",

  // C family
  c: "c", h: "c",
  cpp: "cpp", "c++": "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp",
  cs: "csharp", csharp: "csharp", "c#": "csharp",

  // Systems / functional
  go: "go", golang: "go",
  rs: "rust", rust: "rust",
  dart: "dart",

  // Scripting
  rb: "ruby", ruby: "ruby",
  php: "php",
  perl: "bash", pl: "bash",

  // Data / ML
  r: "r",
  matlab: "matlab", m: "matlab",
  julia: "python", // no Julia grammar — Python is close enough visually

  // Shell
  sh: "bash", bash: "bash", shell: "bash", zsh: "bash", fish: "bash",
  ps1: "powershell", pwsh: "powershell", powershell: "powershell",
  bat: "bash", cmd: "bash",

  // Web
  html: "html", htm: "html",
  xml: "xml", svg: "xml",
  css: "css",
  scss: "scss", sass: "scss", less: "css",

  // Data formats
  json: "json", jsonc: "json",
  yaml: "yaml", yml: "yaml",
  toml: "toml",

  // Query
  sql: "sql", mysql: "sql", psql: "sql", postgres: "sql",
  postgresql: "sql", sqlite: "sql", plsql: "sql",

  // API / Config
  graphql: "graphql", gql: "graphql",
  docker: "docker", dockerfile: "dockerfile",
  md: "markdown", markdown: "markdown",

  // Misc
  tex: "markdown", latex: "markdown", txt: "bash",
};

// ── Display labels ────────────────────────────────────────────────────────
const LANG_LABELS: Record<string, string> = {
  javascript: "JavaScript", typescript: "TypeScript",
  jsx: "JSX", tsx: "TSX",
  python: "Python", java: "Java", kotlin: "Kotlin",
  swift: "Swift", c: "C", cpp: "C++", csharp: "C#",
  go: "Go", rust: "Rust", ruby: "Ruby", php: "PHP",
  scala: "Scala", dart: "Dart", r: "R", matlab: "MATLAB",
  sql: "SQL", bash: "Shell", powershell: "PowerShell",
  html: "HTML", markup: "HTML", xml: "XML", css: "CSS",
  scss: "SCSS", json: "JSON", yaml: "YAML", toml: "TOML",
  graphql: "GraphQL", docker: "Dockerfile", markdown: "Markdown",
};

// ── Theme overrides ───────────────────────────────────────────────────────
// vscDarkPlus already has great colours. We just strip its background
// (we supply our own via the wrapper div) and set our preferred font.
const THEME = {
  ...vscDarkPlus,
  'pre[class*="language-"]': {
    ...vscDarkPlus['pre[class*="language-"]'],
    background: "transparent",
    margin: 0,
    padding: "16px",
    fontSize: "13px",
    lineHeight: "1.7",
    fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code','Consolas',monospace",
  },
  'code[class*="language-"]': {
    ...vscDarkPlus['code[class*="language-"]'],
    background: "transparent",
    fontSize: "13px",
    fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code','Consolas',monospace",
  },
};

// ── Component ─────────────────────────────────────────────────────────────
export default function CodeBlock({
  language = "",
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

  const raw = language.toLowerCase().trim();
  const prismLang = LANG_MAP[raw] ?? raw; // pass raw if not in map; Prism may know it
  const label = LANG_LABELS[prismLang] ?? LANG_LABELS[raw] ?? (raw ? raw.toUpperCase() : "Code");

  return (
    <div
      className="my-3 overflow-hidden rounded-xl"
      style={{ border: "1px solid rgba(255,255,255,0.07)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{
          background: "#1E1E1E",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "11.5px",
            color: "rgba(255,255,255,0.38)",
            letterSpacing: "0.04em",
          }}
        >
          {label}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy code"}
          style={{
            display: "flex", alignItems: "center", gap: "5px",
            fontSize: "12px",
            color: copied ? "#3ECF8E" : "rgba(255,255,255,0.38)",
            background: "none", border: "none",
            cursor: "pointer", padding: "2px 4px",
            borderRadius: "4px", transition: "color 0.15s",
          }}
          onMouseEnter={e => {
            if (!copied)
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.75)";
          }}
          onMouseLeave={e => {
            if (!copied)
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.38)";
          }}
        >
          {copied
            ? <><Check size={12} strokeWidth={2.5} /> Copied</>
            : <><Copy size={12} strokeWidth={1.75} /> Copy</>}
        </button>
      </div>

      {/* Code body — always dark, scroll horizontally for long lines */}
      <div style={{ background: "#1E1E1E", overflowX: "auto" }}>
        <SyntaxHighlighter
          language={prismLang || undefined}
          style={THEME}
          PreTag="div"
          useInlineStyles
          wrapLongLines={false}
        >
          {children}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
