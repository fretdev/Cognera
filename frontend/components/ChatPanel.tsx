"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp, FileText, Pencil, Square,
  Info, BookOpen, Zap, AlertCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { apiPost } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { createConversation, saveMessages } from "@/lib/conversations";
import WelcomeView from "@/components/WelcomeView";
import CodeBlock from "@/components/CodeBlock";

type Source = { document_id: string; document_title: string; snippet: string };
type Mode   = "grounded" | "general";
type Msg = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  mode?: Mode;
  isError?: boolean;
};

const REQUEST_TIMEOUT = 50_000;

const mdComponents = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  code({ inline, className, children, ...props }: any) {
    const lang = (className || "").replace("language-", "");
    const code = String(children).replace(/\n$/, "");
    if (inline) return (
      <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-xs text-ink/90" {...props}>{code}</code>
    );
    return <CodeBlock language={lang}>{code}</CodeBlock>;
  },
};

export default function ChatPanel({
  conversationId: initialId,
  initialMessages = [],
}: {
  conversationId?: string;
  initialMessages?: Msg[];
}) {
  const router = useRouter();
  const [msgs, setMsgs]       = useState<Msg[]>(initialMessages);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode]       = useState<Mode | null>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);

  const convIdRef  = useRef<string | null>(initialId || null);
  const userIdRef  = useRef<string | null>(null);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const textRef    = useRef<HTMLTextAreaElement>(null);
  const abortRef   = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => { userIdRef.current = data.user?.id || null; });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  const resize = useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  function unlock() {
    setLoading(false);
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    abortRef.current = null;
  }

  async function send(question: string, forkAt?: number) {
    if (!question.trim() || loading) return;
    setInput(""); requestAnimationFrame(resize);
    setMsgs(p => [...(forkAt !== undefined ? p.slice(0, forkAt) : p), { role: "user", content: question }]);
    setLoading(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    timeoutRef.current = setTimeout(() => {
      ctrl.abort();
      setMsgs(p => [...p, { role: "assistant", content: "Request timed out. Please try again.", isError: true }]);
      unlock();
    }, REQUEST_TIMEOUT);

    try {
      const res = await apiPost<{ answer: string; sources: Source[]; mode: Mode }>(
        "/chat/ask", { question }, ctrl.signal
      );
      clearTimeout(timeoutRef.current!);
      setMode(res.mode);
      setMsgs(p => [...p, { role: "assistant", content: res.answer, sources: res.sources, mode: res.mode }]);

      const uid = userIdRef.current;
      if (uid) {
        if (!convIdRef.current) {
          const title = question.slice(0, 72);
          const c = await createConversation(title);
          convIdRef.current = c.id;
          router.replace(`/c/${c.id}`);
        }
        await saveMessages(convIdRef.current, uid, [
          { role: "user",      content: question,    sources: [], mode: null },
          { role: "assistant", content: res.answer,  sources: res.sources, mode: res.mode },
        ]);
      }
    } catch (err) {
      clearTimeout(timeoutRef.current!);
      const name    = (err as Error).name;
      const message = (err as Error).message || "";

      if (name === "AbortError") {
        setMsgs(p => p.slice(0, -1));
      } else {
        setMsgs(p => p.slice(0, -1));
        setInput(question); requestAnimationFrame(resize);
        if (message.includes("429")) {
          setMsgs(p => [...p, { role: "assistant", content: "You've hit Gemini's rate limit. Wait a moment and try again.", isError: true }]);
        }
      }
    } finally { unlock(); }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    if (editIdx !== null) { const i = editIdx; setEditIdx(null); await send(q, i); }
    else await send(q);
  }

  function startEdit(i: number) {
    if (msgs[i].role !== "user") return;
    setEditIdx(i); setInput(msgs[i].content);
    requestAnimationFrame(() => { resize(); textRef.current?.focus(); });
  }

  function cancelEdit() { setEditIdx(null); setInput(""); requestAnimationFrame(resize); }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); handleSend(e); return; }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(e); return; }
    if (e.key === "Escape") { editIdx !== null ? cancelEdit() : textRef.current?.blur(); }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-base">
      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-10 md:px-0">
          {msgs.length === 0 ? (
            <WelcomeView onQuickStart={q => { setInput(q); requestAnimationFrame(() => { resize(); textRef.current?.focus(); }); }} />
          ) : (
            <>
              {/* Mode badge + context note */}
              <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-2xs text-quiet">
                  <Info size={11} strokeWidth={1.75} />
                  <span>Using last 20 messages</span>
                </div>
                {mode && (
                  <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs ${
                    mode === "grounded"
                      ? "bg-[#6366F1]/10 text-[#818CF8]"
                      : "bg-raised text-quiet"
                  }`}>
                    {mode === "grounded" ? <BookOpen size={10} strokeWidth={1.75} /> : <Zap size={10} strokeWidth={1.75} />}
                    {mode === "grounded" ? "Source grounded" : "General knowledge"}
                  </div>
                )}
              </div>

              <div className="space-y-8">
                {msgs.map((m, i) => (
                  <div key={i} className={`${i === msgs.length - 1 ? "msg-reveal" : ""}`}>
                    {m.role === "user" ? (
                      /* User message — right aligned, subtle card */
                      <div className="group flex items-start justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(i)}
                          aria-label="Edit message"
                          className="mt-1 flex-shrink-0 rounded p-1 text-quiet opacity-0 transition-opacity hover:text-dim group-hover:opacity-100"
                        >
                          <Pencil size={12} strokeWidth={1.75} />
                        </button>
                        <div className="max-w-[75%] rounded-xl rounded-tr-sm bg-raised px-4 py-2.5 text-sm text-ink">
                          {m.content}
                        </div>
                      </div>
                    ) : (
                      /* AI message — no card, full-width prose */
                      <div>
                        {m.isError ? (
                          <div className="flex items-center gap-2 text-sm text-[#EF4444]">
                            <AlertCircle size={14} strokeWidth={1.75} />
                            {m.content}
                          </div>
                        ) : (
                          <div className="chat-prose">
                            <ReactMarkdown components={mdComponents}>{m.content}</ReactMarkdown>
                          </div>
                        )}
                        {m.sources && m.sources.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {m.sources.map((s, si) => (
                              <span
                                key={si}
                                title={s.snippet}
                                className="flex items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 py-1 text-2xs text-dim"
                              >
                                <FileText size={11} strokeWidth={1.75} />
                                {s.document_title}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {loading && (
                  <div className="flex items-center gap-1.5" role="status" aria-label="Cognera is thinking">
                    <span className="thinking-dot animate-dot-1" />
                    <span className="thinking-dot animate-dot-2" />
                    <span className="thinking-dot animate-dot-3" />
                  </div>
                )}
              </div>
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input ── */}
      <div className="border-t border-line bg-base px-4 py-4 md:px-0">
        {editIdx !== null && (
          <div className="mx-auto mb-2 flex max-w-2xl items-center justify-between text-xs text-dim">
            <span>Editing — reply will branch from this point.</span>
            <button type="button" onClick={cancelEdit} className="text-quiet underline-offset-2 hover:text-dim hover:underline">Cancel</button>
          </div>
        )}
        <form onSubmit={handleSend} className="mx-auto max-w-2xl">
          <div className="input-focus-ring flex items-end gap-2 rounded-xl border border-line bg-surface px-4 py-3 transition-all">
            <textarea
              ref={textRef}
              value={input}
              onChange={e => { setInput(e.target.value); resize(); }}
              onKeyDown={onKey}
              placeholder="Ask anything about your materials…"
              rows={1}
              aria-label="Message Cognera"
              className="max-h-[200px] flex-1 resize-none bg-transparent text-sm text-ink outline-none placeholder:text-quiet"
            />
            {loading ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                aria-label="Stop"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-line text-dim transition-colors hover:border-strong hover:text-ink"
              >
                <Square size={12} strokeWidth={2} fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label="Send"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#6366F1] text-white transition-opacity hover:opacity-90 disabled:opacity-30"
              >
                <ArrowUp size={15} strokeWidth={2.25} />
              </button>
            )}
          </div>
          <p className="mt-2 text-center text-2xs text-quiet">
            Answers grounded in your materials when available · ⌘ Enter to send
          </p>
        </form>
      </div>
    </div>
  );
}
