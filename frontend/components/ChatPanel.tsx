"use client";

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
type Mode   = "grounded" | "general";
type Msg    = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  mode?: Mode;
  isError?: boolean;
  streaming?: boolean;
};

const API_URL         = process.env.NEXT_PUBLIC_API_URL!;
const CONTEXT_WINDOW  = 20;
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

  const convoIdRef   = useRef<string | null>(initConvoId || null);
  const userIdRef    = useRef<string | null>(null);
  const scrollRef    = useRef<HTMLDivElement>(null);
  const bottomRef    = useRef<HTMLDivElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef     = useRef<AbortController | null>(null);
  const timeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinnedRef    = useRef(true);
  const rafRef       = useRef<number | null>(null);
  const typeQueueRef = useRef<string[]>([]);
  const displayedRef = useRef<string>("");

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
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    abortRef.current = null;
    stopTypewriter();
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
    if ((!question.trim() && !attachedFile) || loading) return;

    pinnedRef.current = true;
    setShowScrollBtn(false);
    setInput("");
    requestAnimationFrame(autosize);

    // Handle file upload first
    const fileToUpload = attachedFile;
    setAttachedFile(null);

    if (fileToUpload) {
      // Show user message with file name
      const userMsg = question.trim()
        ? `${question.trim()}\n\n📎 ${fileToUpload.name}`
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

      // If no question text, we're done
      if (!question.trim()) return;
    } else {
      setMessages(prev => {
        const base = forkAtIndex !== undefined ? prev.slice(0, forkAtIndex) : prev;
        return [...base, { role: "user", content: question }];
      });
      requestAnimationFrame(() => scrollToBottom(true));
    }

    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    timeoutRef.current = setTimeout(() => {
      controller.abort();
      setMessages(prev => [...prev.slice(0, -1), {
        role: "assistant", content: "Request timed out. Please try again.", isError: true,
      }]);
      unlockUI();
    }, 45_000);

    try {
      const { data } = await createClient().auth.getSession();
      const token = data.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/chat/stream`, {
        method: "POST", headers,
        body: JSON.stringify({ question: question.trim() }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText.includes("429") ? "429" : errText);
      }

      displayedRef.current = "";
      typeQueueRef.current = [];
      setMessages(prev => [...prev, { role: "assistant", content: "", streaming: true }]);
      startTypewriter();

      const reader  = res.body!.getReader();
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
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === "text")  { fullText += ev.text; typeQueueRef.current.push(...ev.text.split("")); }
            if (ev.type === "done")  { finalSources = ev.sources || []; finalMode = ev.mode || "general"; setCurrentMode(finalMode); }
            if (ev.type === "error") { throw new Error(ev.message); }
          } catch { /* skip malformed */ }
        }
      }

      // Wait for typewriter to drain
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
      await persistMessages(question, fullText, finalSources, finalMode);

    } catch (err) {
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      const name = (err as Error).name;
      const msg  = (err as Error).message || "";
      if (name === "AbortError") {
        setMessages(prev => prev.slice(0, -1));
        setInput(question);
        requestAnimationFrame(autosize);
      } else if (msg.includes("429")) {
        setMessages(prev => [...prev.slice(0, -1), { role: "assistant", content: "Rate limit reached. Wait a moment and try again.", isError: true }]);
      } else {
        setMessages(prev => prev.slice(0, -1));
        setInput(question);
        requestAnimationFrame(autosize);
      }
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
                  background: currentMode === "grounded" ? "var(--accent-soft)" : "rgba(62,207,142,0.08)",
                  color:      currentMode === "grounded" ? "var(--accent)"      : "var(--green)",
                  border:     `1px solid ${currentMode === "grounded" ? "var(--accent-border)" : "rgba(62,207,142,0.2)"}`,
                }}>
                  {currentMode === "grounded"
                    ? <><BookOpen size={10} strokeWidth={2} />Source Grounded</>
                    : <><Zap      size={10} strokeWidth={2} />Web Search</>}
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
                        onMouseEnter={e => (e.currentTarget.style.color = "var(--t1)")}
                        onMouseLeave={e => (e.currentTarget.style.color = "var(--t3)")}>
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
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "var(--red)" }}>
                      <AlertCircle size={15} strokeWidth={1.75} />
                      {m.content}
                    </div>
                  ) : (
                    <>
                      <div className={`chat-prose ${m.streaming ? "stream-cursor" : ""}`} style={{ wordBreak: "break-word" }}>
                        <ReactMarkdown components={mdComponents}>{m.content || (m.streaming ? " " : "")}</ReactMarkdown>
                      </div>
                      {!m.streaming && m.sources && m.sources.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "12px" }}>
                          {m.sources.map((s, si) => (
                            <span key={si} title={s.snippet} style={{
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
                      )}
                    </>
                  )}
                </div>
              );
            })}

            {(loading || uploading) && messages[messages.length - 1]?.role === "user" && (
              <div style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 0" }}
                role="status" aria-label="Cognera is thinking">
                <span className="thinking-dot" />
                <span className="thinking-dot" />
                <span className="thinking-dot" />
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
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FILES}
            className="sr-only"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) setAttachedFile(f);
              e.target.value = "";
            }}
          />

          <div className="chat-input-wrap">
            {/* Attached file chip */}
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
                {/* Attach button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Attach file (PDF, Word, PowerPoint, text)"
                  disabled={loading || uploading}
                  title="Attach file — PDF, Word, PowerPoint, text, CSV"
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: attachedFile ? "var(--accent)" : "var(--t3)",
                    padding: "2px", borderRadius: "6px",
                    display: "flex", alignItems: "center",
                    transition: "color 0.15s",
                    opacity: loading || uploading ? 0.4 : 1,
                  }}
                  onMouseEnter={e => { if (!loading && !uploading) (e.currentTarget.style.color = "var(--t1)"); }}
                  onMouseLeave={e => { (e.currentTarget.style.color = attachedFile ? "var(--accent)" : "var(--t3)"); }}
                >
                  <Plus size={17} strokeWidth={1.75} />
                </button>
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
