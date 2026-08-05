"use client";

import {
  useCallback, useEffect, useRef, useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp, ArrowDown, Square, FileText,
  Pencil, AlertCircle, BookOpen, Zap, Plus, X,
  ChevronDown, Check, Sparkles, Sliders,
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

type ModelId = "auto" | "deepseek" | "groq" | "gemini";

const MODEL_OPTIONS: { id: ModelId; name: string; tag: string; desc: string }[] = [
  { id: "auto", name: "Auto (Smart Route)", tag: "Recommended", desc: "Automatic failover across all free AI models" },
  { id: "deepseek", name: "DeepSeek V3", tag: "OpenRouter", desc: "Deep academic reasoning & math problem solving" },
  { id: "groq", name: "Qwen 2.5 72B", tag: "Groq 500t/s", desc: "Ultra-fast sub-second response generation" },
  { id: "gemini", name: "Gemini 2.0 Flash", tag: "Google AI", desc: "Multimodal document RAG & web search" },
];

const API_URL         = process.env.NEXT_PUBLIC_API_URL!;
const CONTEXT_WINDOW  = 6;
const CHARS_PER_FRAME = 6;
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
  const [selectedModel, setSelectedModel] = useState<ModelId>("auto");
  const [isModelOpen, setIsModelOpen] = useState(false);

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
        // Fast adaptive catch-up to prevent long response lag
        const batchSize = typeQueueRef.current.length > 30 ? 16 : CHARS_PER_FRAME;
        const batch = typeQueueRef.current.splice(0, batchSize).join("");
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
    setThinkingStatus("Analyzing context & searching notes…");
    firstChunkReceived.current = false;

    const controller = new AbortController();
    abortRef.current = controller;

    // UX Progress feedback
    progressTimeoutRef.current = setTimeout(() => {
      if (!firstChunkReceived.current) {
        setThinkingStatus("Searching documents & generating answer…");
      }
    }, 6000);

    // 45s hard abort
    timeoutRef.current = setTimeout(() => {
      controller.abort();
      setMessages(prev => [...prev.slice(0, -1), {
        role: "assistant", content: "Request timed out. Please try asking again.", isError: true,
      }]);
      unlockUI();
    }, 45_000);

    const historyPayload = messages.slice(-10).map(m => ({
      role: m.role,
      content: m.content,
    }));

    const hasDocHistory = messages.some(
      m => m.mode === "grounded" || m.mode === "hybrid" || (m.sources && m.sources.length > 0)
    );

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
          body: JSON.stringify({
            question: currentQuestion,
            conversation_history: historyPayload,
            has_doc_history: hasDocHistory,
            preferred_model: selectedModel,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errText = await res.text();
          if (res.status >= 500 && attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, 1000 * attempt));
            continue;
          }
          throw new Error(errText.includes("429") ? "429" : errText);
        }

        streamRes = res;
        break;

      } catch (err) {
        if (attempt >= maxAttempts) throw err;
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
              if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
              if (progressTimeoutRef.current) { clearTimeout(progressTimeoutRef.current); progressTimeoutRef.current = null; }
            }
            const stepText = ev.step || ev.content || ev.message || "";
            if (stepText) setThinkingStatus(stepText);
          }

          const chunkText = ev.text || ev.content || ev.message || "";

          if (ev.type === "text" && typeof chunkText === "string" && chunkText.length > 0) {
            if (!firstChunkReceived.current) {
              firstChunkReceived.current = true;
              if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
              if (progressTimeoutRef.current) { clearTimeout(progressTimeoutRef.current); progressTimeoutRef.current = null; }
            }
            setThinkingStatus("");
            fullText += chunkText;
            typeQueueRef.current.push(...chunkText.split(""));
          }
          if (ev.type === "done") {
            finalSources = ev.sources || [];
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
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant") {
          copy[copy.length - 1] = {
            ...last,
            content: fullText || displayedRef.current,
            sources: finalSources,
            mode: finalMode,
            streaming: false,
          };
        }
        return copy;
      });

      await persistMessages(currentQuestion, fullText || displayedRef.current, finalSources, finalMode);

    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      const is429 = (err as Error).message === "429" || (err as Error).message?.includes("429");

      const errText = is429
        ? "AI service is temporarily busy. Please wait a few seconds and try asking again."
        : `An error occurred: ${(err as Error).message || "Unknown error"}`;

      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.streaming) {
          return [...prev.slice(0, -1), { role: "assistant", content: errText, isError: true }];
        }
        return [...prev, { role: "assistant", content: errText, isError: true }];
      });

    } finally {
      unlockUI();
    }
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (editingIndex !== null) {
      const q = input;
      const idx = editingIndex;
      setEditingIndex(null);
      sendQuestion(q, idx);
    } else {
      sendQuestion(input);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
      e.preventDefault();
      handleSend(e);
    }
  }

  function handleStop() {
    abortRef.current?.abort();
    unlockUI();
  }

  function startEdit(index: number) {
    setEditingIndex(index);
    setInput(messages[index].content);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      autosize();
    });
  }

  function cancelEdit() {
    setEditingIndex(null);
    setInput("");
    requestAnimationFrame(autosize);
  }

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative", overflow: "hidden" }}>
      {/* Top Bar — Frontier Lab Style Model Selector */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 16px",
        borderBottom: "1px solid var(--b1)",
        background: "var(--bg-glass)",
        backdropFilter: "blur(12px)",
        zIndex: 20,
        position: "relative",
      }}>
        {/* Model Trigger Button */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setIsModelOpen(!isModelOpen)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 10px",
              borderRadius: "8px",
              background: "var(--s2)",
              border: "1px solid var(--b2)",
              color: "var(--t1)",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              {MODEL_OPTIONS.find(m => m.id === selectedModel)?.name}
            </span>
            <ChevronDown size={14} className="text-[var(--t3)]" />
          </button>

          {/* Model Dropdown Menu */}
          {isModelOpen && (
            <>
              <div
                style={{ position: "fixed", inset: 0, zIndex: 30 }}
                onClick={() => setIsModelOpen(false)}
              />
              <div style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0,
                width: "280px",
                background: "var(--s1)",
                border: "1px solid var(--b2)",
                borderRadius: "12px",
                padding: "6px",
                boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
                backdropFilter: "blur(16px)",
                zIndex: 40,
                display: "flex",
                flexDirection: "column",
                gap: "2px",
              }}>
                <div style={{ padding: "6px 8px 4px", fontSize: "11px", fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Model Intelligence
                </div>
                {MODEL_OPTIONS.map((opt) => {
                  const isSelected = opt.id === selectedModel;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setSelectedModel(opt.id);
                        setIsModelOpen(false);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        padding: "8px 10px",
                        borderRadius: "8px",
                        background: isSelected ? "var(--s2)" : "transparent",
                        border: "none",
                        textAlign: "left",
                        cursor: "pointer",
                        width: "100%",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "var(--s2)"; }}
                      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--t1)" }}>{opt.name}</span>
                          <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "4px", background: "var(--s3)", color: "var(--t2)", fontWeight: 500 }}>
                            {opt.tag}
                          </span>
                        </div>
                        <span style={{ fontSize: "11px", color: "var(--t3)", lineHeight: "1.3" }}>{opt.desc}</span>
                      </div>
                      {isSelected && <Check size={14} style={{ color: "var(--accent)", marginTop: "2px", flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Minimalist Model Status Indicator */}
        <div style={{ fontSize: "12px", color: "var(--t3)", fontWeight: 400 }}>
          {selectedModel === "auto" ? "Smart Cascade Active" : `${MODEL_OPTIONS.find(m => m.id === selectedModel)?.tag} Direct`}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, overflowY: "auto", position: "relative" }}>
        <div style={{ maxWidth: "700px", margin: "0 auto", padding: "24px 16px 32px" }}>
          {messages.length === 0 && <WelcomeView onQuickStart={(q: string) => sendQuestion(q)} />}

          <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
            {messages.map((m, i) => {
              const isLatest = i === messages.length - 1;
              if (m.role === "user") {
                return (
                  <div key={i} className="group" style={{ display: "flex", justifyContent: "flex-end" }}>
                    <div style={{ position: "relative", maxWidth: "82%" }}>
                      <div className="user-msg-bubble">
                        {m.content}
                      </div>
                      <div style={{ display: "flex", justifySelf: "flex-end", marginTop: "4px", gap: "4px" }}>
                        <button
                          type="button"
                          onClick={() => startEdit(i)}
                          aria-label="Edit message"
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-[var(--t3)] hover:text-[var(--t1)] rounded"
                          style={{ background: "none", border: "none", cursor: "pointer" }}
                        >
                          <Pencil size={12} strokeWidth={1.75} />
                        </button>
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