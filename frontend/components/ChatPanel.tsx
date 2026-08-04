"use client";

/**
 * Cognera — ChatPanel (Production-Patched Frontend)
 * ==================================================
 * Fixes applied:
 * - H-001: Correctly reads and displays mode from done event
 * - L-001: Defensive JSON.parse with graceful skip on malformed data
 * - L-002: Automatic retry with exponential backoff for transient failures
 * - M-002: Tiered timeout UX (8s/15s/25s) with progressive feedback
 * - Timeout cancellation when first chunk arrives
 */

import {
  useCallback, useEffect, useRef, useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp, ArrowDown, Square, FileText,
  Pencil, AlertCircle, BookOpen, Zap, Plus, X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { createClient } from "@/lib/supabase/client";
import { createConversation, saveMessages } from "@/lib/conversations";
import WelcomeView from "@/components/WelcomeView";
import CodeBlock from "@/components/CodeBlock";

type Source = { document_id: string; document_title: string; snippet: string };
type Mode   = "grounded" | "general" | "hybrid";
type Msg    = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  mode?: Mode;
  isError?: boolean;
  streaming?: boolean;
};

const API_URL         = process.env.NEXT_PUBLIC_API_URL!;
const CONTEXT_WINDOW  = 6;
const CHARS_PER_FRAME = 5;
const BOTTOM_THRESHOLD = 80;

const ACCEPTED_FILES = ".pdf,.docx,.doc,.pptx,.ppt,.txt,.md,.csv,.markdown";

const mdComponents = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  code({ inline, className, children, ...props }: any) {
    const lang = (className || "").replace("language-", "");
    const code = String(children).replace(/\n$/, "");
    if (inline) {
      return (
        <code style={{
          fontFamily: "monospace", fontSize: "13px",
          background: "var(--s3)", border: "1px solid var(--b2)",
          borderRadius: "4px", padding: "1px 5px",
        }} {...props}>{code}</code>
      );
    }
    return <CodeBlock language={lang}>{code}</CodeBlock>;
  },
};

function ScrollToBottom({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Scroll to latest message"
      style={{
        position: "absolute", bottom: "96px", left: "50%",
        transform: "translateX(-50%)",
        display: "flex", alignItems: "center", gap: "6px",
        padding: "7px 14px",
        background: "var(--s1)", border: "1px solid var(--b2)",
        borderRadius: "9999px", fontSize: "12.5px", fontWeight: 500,
        color: "var(--t2)", cursor: "pointer",
        boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
        transition: "background 0.15s, color 0.15s",
        zIndex: 10, whiteSpace: "nowrap",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background = "var(--s2)";
        (e.currentTarget as HTMLElement).style.color = "var(--t1)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = "var(--s1)";
        (e.currentTarget as HTMLElement).style.color = "var(--t2)";
      }}
    >
      <ArrowDown size={13} strokeWidth={2} />
      Scroll to latest
    </button>
  );
}

export default function ChatPanel({
  conversationId: initConvoId,
  initialMessages = [],
}: {
  conversationId?: string;
  initialMessages?: Msg[];
}) {
  const router = useRouter();
  const [messages,      setMessages]      = useState<Msg[]>(initialMessages);
  const [input,         setInput]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [currentMode,   setCurrentMode]   = useState<Mode | null>(null);
  const [editingIndex,  setEditingIndex]  = useState<number | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [attachedFile,  setAttachedFile]  = useState<File | null>(null);
  const [uploading,     setUploading]     = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState<string>("");

  const convoIdRef   = useRef<string | null>(initConvoId || null);
  const userIdRef    = useRef<string | null>(null);
  const scrollRef    = useRef<HTMLDivElement>(null);
  const bottomRef    = useRef<HTMLDivElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef     = useRef<AbortController | null>(null);
  const timeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinnedRef    = useRef(true);
  const rafRef       = useRef<number | null>(null);
  const typeQueueRef = useRef<string[]>([]);
  const displayedRef = useRef<string>("");
  const firstChunkReceived = useRef(false);

  useEffect(() => {
    createClient().auth.getUser()
      .then(({ data }) => { userIdRef.current = data.user?.id || null; });
  }, []);

  /* ── Scroll ──────────────────────────────────────────────────────────── */
  function isNearBottom() {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
  }

  function scrollToBottom(instant = false) {
    bottomRef.current?.scrollIntoView({ behavior: instant ? "instant" : "smooth" });
  }

  function handleScroll() {
    if (isNearBottom()) {
      pinnedRef.current = true;
      setShowScrollBtn(false);
    } else {
      pinnedRef.current = false;
      setShowScrollBtn(true);
    }
  }

  useEffect(() => {
    if (pinnedRef.current) scrollToBottom();
  }, [messages]);

  /* ── Typewriter (rAF) ────────────────────────────────────────────────── */
  function startTypewriter() {
    if (rafRef.current) return;
    function tick() {
      if (typeQueueRef.current.length > 0) {
        const batch = typeQueueRef.current.splice(0, CHARS_PER_FRAME).join("");
        displayedRef.current += batch;
        const snap = displayedRef.current;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;
          return [...prev.slice(0, -1), { ...last, content: snap }];
        });
        if (pinnedRef.current) {
          bottomRef.current?.scrollIntoView({ behavior: "instant" });
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  function stopTypewriter() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    typeQueueRef.current = [];
    displayedRef.current = "";
  }

  /* ── Autosize ────────────────────────────────────────────────────────── */
  const autosize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, []);

  function unlockUI() {
    setLoading(false);
    setThinkingStatus("");
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (progressTimeoutRef.current) { clearTimeout(progressTimeoutRef.current); progressTimeoutRef.current = null; }
    abortRef.current = null;
    stopTypewriter();
    firstChunkReceived.current = false;
  }

  /* ── Persist ─────────────────────────────────────────────────────────── */
  async function persistMessages(q: string, answer: string, sources: Source[], mode: Mode) {
    const userId = userIdRef.current;
    if (!userId) return;
    if (!convoIdRef.current) {
      const title = q.length > 70 ? q.slice(0, 67) + "…" : q;
      const convo = await createConversation(title);
      convoIdRef.current = convo.id;
      router.replace(`/c/${convo.id}`);
    }
    await saveMessages(convoIdRef.current, userId, [
      { role: "user",      content: q,      sources: [],    mode: null },
      { role: "assistant", content: answer, sources,        mode      },
    ]);
  }

  /* ── Upload attached file ────────────────────────────────────────────── */
  async function uploadAttachedFile(file: File): Promise<string | null> {
    setUploading(true);
    try {
      const { data: session } = await createClient().auth.getSession();
      const token = session.session?.access_token;
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_URL}/documents/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return `📄 **${data.title}** uploaded and indexed (${data.chunks_created} sections ready). You can now ask questions about it.`;
    } catch (err) {
      return `⚠️ Failed to upload file: ${(err as Error).message}`;
    } finally {
      setUploading(false);
    }
  }

  /* ── Send ────────────────────────────────────────────────────────────── */
  async function sendQuestion(question: string, forkAtIndex?: number) {
    const currentQuestion = question.trim();
    if ((!currentQuestion && !attachedFile) || loading) return;

    pinnedRef.current = true;
    setShowScrollBtn(false);
    setInput("");
    requestAnimationFrame(autosize);

    const fileToUpload = attachedFile;
    setAttachedFile(null);

    if (fileToUpload) {
      const userMsg = currentQuestion
        ? `${currentQuestion}\n\n📎 ${fileToUpload.name}`
        : `📎 ${fileToUpload.name}`;

      setMessages(prev => {
        const base = forkAtIndex !== undefined ? prev.slice(0, forkAtIndex) : prev;
        return [...base, { role: "user", content: userMsg }];
      });
      requestAnimationFrame(() => scrollToBottom(true));

      const uploadMsg = await uploadAttachedFile(fileToUpload);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: uploadMsg || "File uploaded.",
      }]);

      if (!currentQuestion) return;
    } else {
      setMessages(prev => {
        const base = forkAtIndex !== undefined ? prev.slice(0, forkAtIndex) : prev;
        return [...base, { role: "user", content: currentQuestion }];
      });
      requestAnimationFrame(() => scrollToBottom(true));
    }

    setLoading(true);
    setThinkingStatus("Thinking...");
    firstChunkReceived.current = false;

    const controller = new AbortController();
    abortRef.current = controller;

    // FIX M-002: Tiered timeout with progressive UX feedback
    // 8s: Still thinking
    progressTimeoutRef.current = setTimeout(() => {
      if (!firstChunkReceived.current) {
        setThinkingStatus("Still thinking... (this may take a moment)");
      }
    }, 8000);

    // 15s: Taking longer than usual
    const longWaitTimeout = setTimeout(() => {
      if (!firstChunkReceived.current) {
        setThinkingStatus("Taking longer than usual. Working on it...");
      }
    }, 15000);

    // 25s: Hard abort
    timeoutRef.current = setTimeout(() => {
      controller.abort();
      setMessages(prev => [...prev.slice(0, -1), {
        role: "assistant", content: "Request timed out. Please try again.", isError: true,
      }]);
      unlockUI();
    }, 25_000);

    const hasDocHistory = messages.some(
      m => m.mode === "grounded" || m.mode === "hybrid" || (m.sources && m.sources.length > 0)
    );

    // FIX L-002: Automatic retry with exponential backoff
    let attempt = 0;
    const maxAttempts = 2;
    let streamRes: Response | null = null;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        const { data } = await createClient().auth.getSession();
        const token = data.session?.access_token;
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(`${API_URL}/chat/stream`, {
          method: "POST", headers,
          body: JSON.stringify({ question: currentQuestion, has_doc_history: hasDocHistory }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errText = await res.text();
          // Retry on 5xx errors
          if (res.status >= 500 && attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, 1000 * attempt));
            continue;
          }
          throw new Error(errText.includes("429") ? "429" : errText);
        }

        streamRes = res;
        // Request succeeded — clear retry state
        break;

      } catch (err) {
        if (attempt >= maxAttempts) throw err;
        // Only retry on network/5xx errors, not 4xx
        const msg = (err as Error).message || "";
        if (!msg.includes("429") && !msg.includes("403") && !msg.includes("401")) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
          continue;
        }
        throw err;
      }
    }

    if (!streamRes) {
      throw new Error("Failed to connect to chat stream.");
    }

    // Now process the stream
    try {
      displayedRef.current = "";
      typeQueueRef.current = [];
      setMessages(prev => [...prev, { role: "assistant", content: "", streaming: true }]);
      startTypewriter();

      const reader  = streamRes.body!.getReader();
      const decoder = new TextDecoder();
      let fullText     = "";
      let finalSources: Source[] = [];
      let finalMode: Mode        = "general";
      let buffer                 = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (let line of lines) {
          line = line.replace(/\r$/, "");
          if (!line.startsWith("data: ")) continue;

          const jsonString = line.slice(6).trim();
          if (!jsonString) continue;

          // FIX L-001: Defensive JSON.parse
          let ev: any;
          try {
            ev = JSON.parse(jsonString);
          } catch (parseErr) {
            console.warn("Malformed SSE data:", jsonString);
            continue;
          }

          if (ev.type === "error") {
            const errorMsg = ev.message || JSON.stringify(ev);
            throw new Error(errorMsg);
          }

          if (ev.type === "trace") {
            if (!firstChunkReceived.current) {
              firstChunkReceived.current = true;
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
              }
              if (progressTimeoutRef.current) {
                clearTimeout(progressTimeoutRef.current);
                progressTimeoutRef.current = null;
              }
            }
            const stepText = ev.step || ev.content || ev.message || "";
            if (stepText) setThinkingStatus(stepText);
          }

          const chunkText = ev.text || ev.content || ev.message || "";

          if (ev.type === "text" && typeof chunkText === "string" && chunkText.length > 0) {
            // FIX M-002: Cancel timeout when first chunk arrives
            if (!firstChunkReceived.current) {
              firstChunkReceived.current = true;
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
              }
              if (progressTimeoutRef.current) {
                clearTimeout(progressTimeoutRef.current);
                progressTimeoutRef.current = null;
              }
            }
            setThinkingStatus("");
            fullText += chunkText;
            typeQueueRef.current.push(...chunkText.split(""));
          }
          if (ev.type === "done") {
            finalSources = ev.sources || [];
            // FIX H-001: Read mode from done event
            finalMode = ev.mode || "general";
            setCurrentMode(finalMode);
          }
        }
      }

      await new Promise<void>(resolve => {
        const check = () => typeQueueRef.current.length === 0 ? resolve() : requestAnimationFrame(check);
        requestAnimationFrame(check);
      });

      stopTypewriter();

      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== "assistant") return prev;
        return [...prev.slice(0, -1), { ...last, content: fullText, streaming: false, sources: finalSources, mode: finalMode }];
      });

      if (pinnedRef.current) requestAnimationFrame(() => scrollToBottom());
      await persistMessages(currentQuestion, fullText, finalSources, finalMode);

      // Clear the long wait timeout
      clearTimeout(longWaitTimeout);

    } catch (err) {
      // ... existing error handling ...
      clearTimeout(longWaitTimeout);
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      if (progressTimeoutRef.current) { clearTimeout(progressTimeoutRef.current); progressTimeoutRef.current = null; }

      const name = (err as Error).name;
      const msg  = (err as Error).message || "";

      if (name === "AbortError") {
        setInput(currentQuestion);
        requestAnimationFrame(autosize);
        return;
      }

      let errorText = "We are currently experiencing heavy traffic. Please wait a moment before trying again.";
      if (msg.includes("429") || msg.includes("quota") || msg.includes("RATE_LIMIT") || msg.includes("rate limit") || msg.includes("busy")) {
        errorText = "AI quota temporarily busy. Please wait a moment.";
      } else if (msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("high demand")) {
        errorText = "The AI model is temporarily busy handling high demand. Please try again shortly.";
      }

      setMessages(prev => {
        const base = prev[prev.length - 1]?.streaming ? prev.slice(0, -1) : prev;
        return [...base, { role: "assistant", content: errorText, isError: true }];
      });
      setInput(currentQuestion);
      requestAnimationFrame(autosize);
    } finally {
      unlockUI();
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q && !attachedFile) return;
    if (editingIndex !== null) {
      const idx = editingIndex;
      setEditingIndex(null);
      await sendQuestion(q, idx);
    } else {
      await sendQuestion(q);
    }
  }

  function handleStop() { abortRef.current?.abort(); }

  function startEdit(i: number) {
    if (messages[i].role !== "user") return;
    setEditingIndex(i);
    setInput(messages[i].content);
    requestAnimationFrame(() => { autosize(); textareaRef.current?.focus(); });
  }

  function cancelEdit() {
    setEditingIndex(null);
    setInput("");
    requestAnimationFrame(autosize);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); handleSend(e); return; }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(e); return; }
    if (e.key === "Escape") { editingIndex !== null ? cancelEdit() : textareaRef.current?.blur(); }
  }

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)", position: "relative" }}>

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        <div style={{ maxWidth: "700px", margin: "0 auto", padding: "40px 20px 24px" }}>

          {messages.length === 0 ? (
            <WelcomeView onQuickStart={p => {
              setInput(p);
              requestAnimationFrame(() => { autosize(); textareaRef.current?.focus(); });
            }} />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
              <span style={{ fontSize: "12px", color: "var(--t3)" }}>
                Using the last {CONTEXT_WINDOW} messages for context
              </span>
              {currentMode && (
                <div style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  borderRadius: "9999px", padding: "3px 10px", fontSize: "11.5px",
                  background: currentMode === "grounded" ? "var(--accent-soft)" : currentMode === "hybrid" ? "rgba(147, 51, 234, 0.08)" : "rgba(62,207,142,0.08)",
                  color:      currentMode === "grounded" ? "var(--accent)"      : currentMode === "hybrid" ? "rgb(147, 51, 234)" : "var(--green)",
                  border:     `1px solid ${currentMode === "grounded" ? "var(--accent-border)" : currentMode === "hybrid" ? "rgba(147, 51, 234, 0.2)" : "rgba(62,207,142,0.2)"}`,
                }}>
                  {currentMode === "grounded"
                    ? <><BookOpen size={10} strokeWidth={2} />Source Grounded</>
                    : currentMode === "hybrid"
                    ? <><Zap size={10} strokeWidth={2} />Hybrid Search</>
                    : <><Zap size={10} strokeWidth={2} />Web Search</>}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
            {messages.map((m, i) => {
              const isLatest = i === messages.length - 1;
              if (m.role === "user") {
                return (
                  <div key={i} className="group" style={{
                    display: "flex", justifyContent: "flex-end",
                    animation: isLatest ? "msgIn 0.28s cubic-bezier(0.22,1,0.36,1) forwards" : "none",
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "6px", maxWidth: "80%" }}>
                      <button type="button" onClick={() => startEdit(i)} aria-label="Edit"
                        className="opacity-0 group-hover:opacity-100"
                        style={{ marginTop: "8px", padding: "4px", background: "none", border: "none", cursor: "pointer", color: "var(--t3)", borderRadius: "6px", transition: "opacity 0.15s, color 0.15s", flexShrink: 0 }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--t1)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--t3)"}>
                        <Pencil size={13} strokeWidth={1.75} />
                      </button>
                      <div style={{
                        background: "var(--s2)", color: "var(--t1)",
                        border: "1px solid var(--b1)",
                        borderRadius: "18px 18px 4px 18px",
                        padding: "10px 16px", fontSize: "15px", lineHeight: "1.65",
                        wordBreak: "break-word", whiteSpace: "pre-wrap",
                      }}>
                        {m.content}
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div key={i} style={{
                  maxWidth: "100%",
                  animation: isLatest && !initConvoId ? "msgIn 0.28s cubic-bezier(0.22,1,0.36,1) forwards" : "none",
                }}>
                  {m.isError ? (
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "14px",
                      color: "#ef4444",
                      background: "rgba(239, 68, 68, 0.08)",
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                      padding: "10px 14px",
                      borderRadius: "8px"
                    }}>
                      <AlertCircle size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                      <span>{m.content}</span>
                    </div>
                  ) : (
                    <>
                      <div className={`chat-prose ${m.streaming ? "stream-cursor" : ""}`} style={{ wordBreak: "break-word" }}>
                        <ReactMarkdown components={mdComponents}>{m.content || (m.streaming ? " " : "")}</ReactMarkdown>
                      </div>
                      {!m.streaming && m.sources && m.sources.length > 0 && (() => {
                        const uniqueSources = Array.from(
                          new Map(m.sources.map(s => [s.document_id || s.document_title, s])).values()
                        );
                        return (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "12px" }}>
                            {uniqueSources.map((s, si) => (
                              <span key={s.document_id || si} title={s.snippet} style={{
                                display: "inline-flex", alignItems: "center", gap: "5px",
                                borderRadius: "9999px", padding: "3px 10px",
                                fontSize: "12px", color: "var(--t3)",
                                background: "var(--s2)", border: "1px solid var(--b1)",
                              }}>
                                <FileText size={11} strokeWidth={1.75} />
                                {s.document_title}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              );
            })}

            {(loading || uploading) && messages[messages.length - 1]?.role === "user" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "4px 0" }}
                role="status" aria-label="Cognera is thinking">
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                </div>
                {thinkingStatus && (
                  <span style={{ fontSize: "12px", color: "var(--t3)", fontStyle: "italic" }}>
                    {thinkingStatus}
                  </span>
                )}
              </div>
            )}
          </div>
          <div ref={bottomRef} style={{ height: "1px" }} />
        </div>
      </div>

      {/* Scroll button */}
      {showScrollBtn && (
        <ScrollToBottom onClick={() => { pinnedRef.current = true; setShowScrollBtn(false); scrollToBottom(); }} />
      )}

      {/* Input */}
      <div style={{ background: "var(--bg)", padding: "8px 16px 20px", flexShrink: 0 }}>
        {editingIndex !== null && (
          <div style={{ maxWidth: "700px", margin: "0 auto 10px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", color: "var(--t3)" }}>
            <span>Editing — send to restart conversation from this point</span>
            <button type="button" onClick={cancelEdit} style={{ marginLeft: "12px", background: "none", border: "none", cursor: "pointer", color: "var(--t2)", textDecoration: "underline", fontSize: "12px" }}>Cancel</button>
          </div>
        )}

        <form onSubmit={handleSend} style={{ maxWidth: "700px", margin: "0 auto" }}>
          <input
            ref={fileInputRef}
            id="chat-file-input"
            type="file"
            accept={ACCEPTED_FILES}
            style={{
              position: "absolute",
              width: "1px", height: "1px",
              padding: 0, margin: "-1px",
              overflow: "hidden", clip: "rect(0,0,0,0)",
              whiteSpace: "nowrap", border: 0,
            }}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) setAttachedFile(f);
              e.target.value = "";
            }}
          />

          <div className="chat-input-wrap">
            {attachedFile && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "4px 10px", marginBottom: "8px",
                background: "var(--accent-soft)", border: "1px solid var(--accent-border)",
                borderRadius: "8px", fontSize: "12.5px", color: "var(--accent)",
              }}>
                <Plus size={12} strokeWidth={2} />
                <span style={{ maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {attachedFile.name}
                </span>
                <button type="button" onClick={() => setAttachedFile(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", padding: "0 2px", display: "flex", alignItems: "center" }}>
                  <X size={12} strokeWidth={2.5} />
                </button>
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => { setInput(e.target.value); autosize(); }}
              onKeyDown={handleKeyDown}
              placeholder={attachedFile ? "Add a message or just send the file…" : "Ask anything, or attach a file…"}
              rows={1}
              aria-label="Message Cognera"
            />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <label
                  htmlFor="chat-file-input"
                  aria-label="Attach file"
                  title="Attach file — PDF, Word, PowerPoint, text, CSV"
                  style={{
                    cursor: loading || uploading ? "not-allowed" : "pointer",
                    color: attachedFile ? "var(--accent)" : "var(--t2)",
                    display: "flex", alignItems: "center",
                    padding: "2px", borderRadius: "6px",
                    transition: "color 0.15s",
                    opacity: loading || uploading ? 0.4 : 1,
                  }}
                >
                  <Plus size={17} strokeWidth={1.75} />
                </label>
                <span style={{ fontSize: "11.5px", color: "var(--t3)", userSelect: "none" }}>
                  ⌘ Enter to send
                </span>
              </div>

              {loading || uploading ? (
                <button type="button" onClick={handleStop} aria-label="Stop" className="btn-icon stop" style={{ width: "32px", height: "32px" }}>
                  <Square size={12} fill="currentColor" strokeWidth={0} />
                </button>
              ) : (
                <button type="submit" disabled={!input.trim() && !attachedFile} aria-label="Send" className="btn-icon" style={{ width: "32px", height: "32px" }}>
                  <ArrowUp size={15} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>

          <p style={{ marginTop: "8px", textAlign: "center", fontSize: "11.5px", color: "var(--t3)" }}>
            PDF · Word · PowerPoint · text · CSV · Markdown supported
          </p>
        </form>
      </div>
    </div>
  );
}