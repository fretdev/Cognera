"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Square, FileText, Pencil, AlertCircle, BookOpen, Zap } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { apiPost } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { createConversation, saveMessages } from "@/lib/conversations";
import WelcomeView from "@/components/WelcomeView";
import CodeBlock from "@/components/CodeBlock";

type Source = { document_id: string; document_title: string; snippet: string };
type Mode = "grounded" | "general";
type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  mode?: Mode;
  isError?: boolean;
  streaming?: boolean;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL!;
const CONTEXT_WINDOW = 20;

const mdComponents = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  code({ inline, className, children, ...props }: any) {
    const lang = (className || "").replace("language-", "");
    const code = String(children).replace(/\n$/, "");
    if (inline) return (
      <code style={{ fontFamily: "monospace", fontSize: "13px", background: "var(--s3)", border: "1px solid var(--b2)", borderRadius: "4px", padding: "1px 5px" }} {...props}>{code}</code>
    );
    return <CodeBlock language={lang}>{code}</CodeBlock>;
  },
};

export default function ChatPanel({
  conversationId: initConvoId,
  initialMessages = [],
}: {
  conversationId?: string;
  initialMessages?: Message[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentMode, setCurrentMode] = useState<Mode | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const convoIdRef = useRef<string | null>(initConvoId || null);
  const userIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Typewriter queue — incoming chunks are pushed here; a fixed-rate
  // interval drains them character by character so the reveal is smooth
  // regardless of how large or irregular Gemini's chunks are.
  const typeQueueRef = useRef<string[]>([]);
  const typeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks displayed text separately so the interval can read it without
  // triggering re-renders on every character.
  const displayedRef = useRef<string>("");

  function startTypewriter() {
    if (typeIntervalRef.current) return;
    typeIntervalRef.current = setInterval(() => {
      if (typeQueueRef.current.length === 0) return;
      // Drain a small batch per tick — 3 chars at ~60fps ≈ ~180 chars/s,
      // which feels natural and close to reading speed.
      const batch = typeQueueRef.current.splice(0, 3).join("");
      displayedRef.current += batch;
      const snapshot = displayedRef.current;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== "assistant") return prev;
        return [...prev.slice(0, -1), { ...last, content: snapshot }];
      });
    }, 16); // ~60fps
  }

  function stopTypewriter() {
    if (typeIntervalRef.current) {
      clearInterval(typeIntervalRef.current);
      typeIntervalRef.current = null;
    }
    typeQueueRef.current = [];
    displayedRef.current = "";
  }

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => { userIdRef.current = data.user?.id || null; });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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

  async function persistMessages(question: string, answer: string, sources: Source[], mode: Mode) {
    const userId = userIdRef.current;
    if (!userId) return;
    if (!convoIdRef.current) {
      const title = question.length > 70 ? question.slice(0, 67) + "…" : question;
      const convo = await createConversation(title);
      convoIdRef.current = convo.id;
      router.replace(`/c/${convo.id}`);
    }
    await saveMessages(convoIdRef.current, userId, [
      { role: "user", content: question, sources: [], mode: null },
      { role: "assistant", content: answer, sources, mode },
    ]);
  }

  async function sendQuestion(question: string, forkAtIndex?: number) {
    if (!question.trim() || loading) return;

    // Clear input immediately — restore only on failure
    setInput("");
    requestAnimationFrame(autosize);

    setMessages(prev => {
      const base = forkAtIndex !== undefined ? prev.slice(0, forkAtIndex) : prev;
      return [...base, { role: "user", content: question }];
    });
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // Safety timeout
    timeoutRef.current = setTimeout(() => {
      controller.abort();
      setMessages(prev => [...prev.slice(0, -1),
        { role: "assistant", content: "Request timed out. Please try again.", isError: true }]);
      unlockUI();
    }, 45_000);

    try {
      // Get auth token
      const { data } = await createClient().auth.getSession();
      const token = data.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/chat/stream`, {
        method: "POST",
        headers,
        body: JSON.stringify({ question }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText.includes("429") ? "429" : errText);
      }

      // Add placeholder streaming message and reset typewriter state
      displayedRef.current = "";
      typeQueueRef.current = [];
      setMessages(prev => [...prev, { role: "assistant", content: "", streaming: true }]);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let finalSources: Source[] = [];
      let finalMode: Mode = "general";
      let buffer = "";

      // Start the typewriter drain before reading so it's ready immediately
      startTypewriter();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "text") {
              fullText += data.text;
              // Push individual characters into the queue — the interval
              // drains them smoothly rather than applying the full chunk at once.
              typeQueueRef.current.push(...data.text.split(""));
            } else if (data.type === "done") {
              finalSources = data.sources || [];
              finalMode = data.mode || "general";
              setCurrentMode(finalMode);
            } else if (data.type === "error") {
              throw new Error(data.message);
            }
          } catch { /* skip malformed chunks */ }
        }
      }

      // Wait for the typewriter to finish draining before finalising the
      // message so it transitions cleanly from streaming to rendered markdown.
      await new Promise<void>(resolve => {
        const check = setInterval(() => {
          if (typeQueueRef.current.length === 0) {
            clearInterval(check);
            resolve();
          }
        }, 16);
      });

      stopTypewriter();

      // Switch from plain-text streaming view to full markdown rendering
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== "assistant") return prev;
        return [...prev.slice(0, -1), {
          ...last,
          content: fullText,
          streaming: false,
          sources: finalSources,
          mode: finalMode,
        }];
      });

      // Persist after streaming completes
      await persistMessages(question, fullText, finalSources, finalMode);

    } catch (err) {
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      const name = (err as Error).name;
      const msg = (err as Error).message || "";

      if (name === "AbortError") {
        setMessages(prev => prev.slice(0, -1));
        setInput(question);
      } else if (msg.includes("429")) {
        setMessages(prev => [...prev.slice(0, -1),
          { role: "assistant", content: "Rate limit reached. Wait a moment and try again.", isError: true }]);
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
    if (!q) return;
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

  // snapshot for the stream-cursor ref
  let snapshot = "";

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--bg)" }}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-10 md:px-6">
          {messages.length === 0 ? (
            <WelcomeView onQuickStart={p => { setInput(p); requestAnimationFrame(() => { autosize(); textareaRef.current?.focus(); }); }} />
          ) : (
            <div className="mb-6 flex items-center justify-between">
              <span className="text-xs" style={{ color: "var(--t3)" }}>
                Using the last {CONTEXT_WINDOW} messages for context
              </span>
              {currentMode && (
                <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
                  style={{
                    background: currentMode === "grounded" ? "var(--accent-soft)" : "rgba(52,199,142,0.1)",
                    color: currentMode === "grounded" ? "var(--accent)" : "var(--green)",
                    border: `1px solid ${currentMode === "grounded" ? "var(--accent-border)" : "rgba(52,199,142,0.25)"}`,
                  }}>
                  {currentMode === "grounded"
                    ? <><BookOpen size={10} strokeWidth={2} /> Source Grounded</>
                    : <><Zap size={10} strokeWidth={2} /> Web Search</>}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-8">
            {messages.map((m, i) => {
              const isNew = i === messages.length - 1;
              if (m.role === "user") {
                return (
                  <div key={i} className={`group flex justify-end ${isNew ? "msg-in" : ""}`}>
                    <div className="flex items-start gap-2 max-w-[75%]">
                      <button type="button" onClick={() => startEdit(i)} aria-label="Edit"
                        className="mt-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: "var(--t3)" }}>
                        <Pencil size={13} strokeWidth={1.75} />
                      </button>
                      <div
                        style={{
                          background: "var(--s2)",
                          color: "var(--t1)",
                          border: "1px solid var(--b1)",
                          borderRadius: "18px 18px 4px 18px",
                          padding: "10px 16px",
                          fontSize: "14.5px",
                          lineHeight: "1.65",
                        }}
                      >
                        {m.content}
                      </div>
                    </div>
                  </div>
                );
              }
              // Assistant
              const isStreaming = m.streaming;
              snapshot = m.content;
              return (
                <div key={i} className={`max-w-full ${isNew && !initConvoId ? "msg-in" : ""}`}>
                  {m.isError ? (
                    <div className="flex items-center gap-2 text-sm" style={{ color: "var(--red)" }}>
                      <AlertCircle size={14} strokeWidth={1.75} /> {m.content}
                    </div>
                  ) : (
                    <>
                      <div className={`chat-prose ${isStreaming ? "stream-cursor" : ""}`}>
                        <ReactMarkdown components={mdComponents}>{m.content || " "}</ReactMarkdown>
                      </div>
                      {!isStreaming && m.sources && m.sources.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {m.sources.map((s, si) => (
                            <span key={si} title={s.snippet}
                              className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs"
                              style={{ background: "var(--s2)", border: "1px solid var(--b1)", color: "var(--t3)" }}>
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

            {/* Thinking state — shows before first stream chunk arrives */}
            {loading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex items-center gap-1.5 py-2">
                <span className="thinking-dot" />
                <span className="thinking-dot" />
                <span className="thinking-dot" />
              </div>
            )}
          </div>
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="px-4 pb-6 pt-2 md:px-8" style={{ background: "var(--bg)" }}>
        {editingIndex !== null && (
          <div className="mx-auto mb-3 max-w-2xl flex items-center justify-between text-xs"
            style={{ color: "var(--t3)" }}>
            <span>Editing message — send to fork conversation from this point</span>
            <button type="button" onClick={cancelEdit}
              className="ml-3 underline transition-colors hover:text-t1"
              style={{ color: "var(--t2)" }}>Cancel</button>
          </div>
        )}

        <form onSubmit={handleSend} className="mx-auto max-w-2xl">
          <div className="chat-input-wrap">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => { setInput(e.target.value); autosize(); }}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything…"
              rows={1}
              aria-label="Message Cognera"
            />
            {/* Bottom row: hint + send/stop */}
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs select-none" style={{ color: "var(--t3)" }}>
                ⌘ Enter to send · Shift+Enter for new line
              </span>
              <div className="flex items-center gap-2">
                {loading ? (
                  <button type="button" onClick={handleStop} aria-label="Stop"
                    className="btn-icon stop" style={{ width: "32px", height: "32px" }}>
                    <Square size={13} fill="currentColor" strokeWidth={0} />
                  </button>
                ) : (
                  <button type="submit" disabled={!input.trim()} aria-label="Send"
                    className="btn-icon" style={{ width: "32px", height: "32px" }}>
                    <ArrowUp size={16} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>
          </div>
          <p className="mt-2 text-center text-xs" style={{ color: "var(--t3)" }}>
            Answers from your documents when available — web search for everything else.
          </p>
        </form>
      </div>
    </div>
  );
}
