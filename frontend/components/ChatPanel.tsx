"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp, FileText, Pencil, Square,
  Info, BookOpen, Zap, AlertCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { apiPost } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import {
  createConversation,
  saveMessages,
} from "@/lib/conversations";
import WelcomeView from "@/components/WelcomeView";
import CodeBlock from "@/components/CodeBlock";

type SourceChip = { document_id: string; document_title: string; snippet: string };
type Mode = "grounded" | "general";
type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: SourceChip[];
  mode?: Mode;
  isError?: boolean;
};

const CONTEXT_WINDOW = 20;
const REQUEST_TIMEOUT_MS = 45_000;

// Custom markdown renderers — wires CodeBlock into react-markdown so fenced
// code blocks get the language label + copy button treatment.
const markdownComponents = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  code({ inline, className, children, ...props }: any) {
    const language = (className || "").replace("language-", "");
    const code = String(children).replace(/\n$/, "");
    if (inline) {
      return (
        <code
          className="rounded bg-[#1a1b1c] px-1.5 py-0.5 font-mono text-xs text-[#e3e3e3]"
          {...props}
        >
          {code}
        </code>
      );
    }
    return <CodeBlock language={language}>{code}</CodeBlock>;
  },
};

export default function ChatPanel({
  conversationId: initialConversationId,
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

  // Tracks the active conversation ID. Null = new chat not yet persisted.
  const conversationIdRef = useRef<string | null>(initialConversationId || null);
  // User ID needed to save messages to Supabase.
  const userIdRef = useRef<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch user ID once on mount.
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        userIdRef.current = data.user?.id || null;
      });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const autosize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  function focusInput() {
    textareaRef.current?.focus();
  }

  function clearTimeout_() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function unlockUI() {
    setLoading(false);
    clearTimeout_();
    abortControllerRef.current = null;
  }

  async function sendQuestion(question: string, forkAtIndex?: number) {
    if (!question.trim() || loading) return;

    setInput("");
    requestAnimationFrame(autosize);

    setMessages((prev) => {
      const base =
        forkAtIndex !== undefined ? prev.slice(0, forkAtIndex) : prev;
      return [...base, { role: "user", content: question }];
    });
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    timeoutRef.current = setTimeout(() => {
      controller.abort();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "The request timed out. Please try again.",
          isError: true,
        },
      ]);
      unlockUI();
    }, REQUEST_TIMEOUT_MS);

    try {
      const res = await apiPost<{
        answer: string;
        sources: SourceChip[];
        mode: Mode;
      }>("/chat/ask", { question }, controller.signal);

      clearTimeout_();
      setCurrentMode(res.mode);

      const assistantMessage: Message = {
        role: "assistant",
        content: res.answer,
        sources: res.sources,
        mode: res.mode,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Persist to Supabase. On the very first exchange of a new chat,
      // create the conversation first, then navigate to its URL so the
      // sidebar can pick it up and the URL is shareable.
      const userId = userIdRef.current;
      if (userId) {
        if (!conversationIdRef.current) {
          // New conversation — title is the first question, capped at 60 chars.
          const title =
            question.length > 60 ? question.slice(0, 57) + "…" : question;
          const convo = await createConversation(title);
          conversationIdRef.current = convo.id;
          router.replace(`/c/${convo.id}`);
        }

        await saveMessages(conversationIdRef.current, userId, [
          { role: "user", content: question, sources: [], mode: null },
          {
            role: "assistant",
            content: res.answer,
            sources: res.sources,
            mode: res.mode,
          },
        ]);
      }
    } catch (err) {
      clearTimeout_();
      const name = (err as Error).name;
      const message = (err as Error).message || "";

      if (name === "AbortError") {
        setMessages((prev) => prev.slice(0, -1));
        setInput(question);
        requestAnimationFrame(autosize);
      } else if (message.includes("429")) {
        setMessages((prev) => prev.slice(0, -1));
        setInput(question);
        requestAnimationFrame(autosize);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Cognera has hit Gemini's rate limit. Wait a moment and try again.",
            isError: true,
          },
        ]);
      } else {
        setMessages((prev) => prev.slice(0, -1));
        setInput(question);
        requestAnimationFrame(autosize);
      }
    } finally {
      unlockUI();
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question) return;
    if (editingIndex !== null) {
      const forkAt = editingIndex;
      setEditingIndex(null);
      await sendQuestion(question, forkAt);
    } else {
      await sendQuestion(question);
    }
  }

  function handleStop() {
    abortControllerRef.current?.abort();
  }

  function startEdit(index: number) {
    if (messages[index].role !== "user") return;
    setEditingIndex(index);
    setInput(messages[index].content);
    requestAnimationFrame(() => {
      autosize();
      focusInput();
    });
  }

  function cancelEdit() {
    setEditingIndex(null);
    setInput("");
    requestAnimationFrame(autosize);
  }

  function handleQuickStart(prompt: string) {
    setInput(prompt);
    requestAnimationFrame(() => {
      autosize();
      focusInput();
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend(e);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
      return;
    }
    if (e.key === "Escape") {
      editingIndex !== null
        ? cancelEdit()
        : textareaRef.current?.blur();
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
          {messages.length === 0 ? (
            <WelcomeView onQuickStart={handleQuickStart} />
          ) : (
            <div className="mb-6 flex items-center justify-between">
              <div
                className="flex items-center gap-1.5 text-xs text-muted"
                role="note"
              >
                <Info size={13} strokeWidth={1.75} />
                <span>Using the last {CONTEXT_WINDOW} messages for context</span>
              </div>
              {currentMode && (
                <div
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                    currentMode === "grounded"
                      ? "border-[#4285F4]/30 bg-[#4285F4]/10 text-[#4285F4]"
                      : "border-border bg-surface text-muted"
                  }`}
                >
                  {currentMode === "grounded" ? (
                    <BookOpen size={11} strokeWidth={1.75} />
                  ) : (
                    <Zap size={11} strokeWidth={1.75} />
                  )}
                  {currentMode === "grounded"
                    ? "Source Grounded"
                    : "General Assistant"}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-7">
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user" ? "group flex justify-end" : "group"
                }
              >
                {m.role === "user" ? (
                  <div className="flex max-w-[80%] items-start gap-1.5">
                    <button
                      type="button"
                      aria-label="Edit message"
                      onClick={() => startEdit(i)}
                      className="mt-2.5 flex-shrink-0 rounded-md p-1 text-muted opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
                    >
                      <Pencil size={14} strokeWidth={1.75} />
                    </button>
                    <div className={`rounded-3xl bg-surface px-4 py-2.5 text-sm text-ink ${i === messages.length - 1 ? "message-reveal" : ""}`}>
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div className={`max-w-[90%] ${i === messages.length - 1 ? "message-reveal" : ""}`}>
                    {m.isError ? (
                      <div className="flex items-center gap-2 text-sm text-[#f28b82]">
                        <AlertCircle size={15} strokeWidth={1.75} />
                        {m.content}
                      </div>
                    ) : (
                      <div className="chat-prose">
                        <ReactMarkdown components={markdownComponents}>
                          {m.content}
                        </ReactMarkdown>
                      </div>
                    )}
                    {m.sources && m.sources.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {m.sources.map((s, si) => (
                          <span
                            key={si}
                            title={s.snippet}
                            className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted"
                          >
                            <FileText size={12} strokeWidth={1.75} />
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
              <div
                className="flex items-center gap-1.5 py-1"
                role="status"
                aria-label="Cognera is thinking"
              >
                <span className="thinking-dot gradient-bg h-2 w-2 rounded-full" />
                <span className="thinking-dot gradient-bg h-2 w-2 rounded-full" />
                <span className="thinking-dot gradient-bg h-2 w-2 rounded-full" />
              </div>
            )}
          </div>
          <div ref={bottomRef} />
        </div>
      </div>

      <form onSubmit={handleSend} className="bg-bg px-4 pb-6 pt-2 md:px-6">
        {editingIndex !== null && (
          <div className="mx-auto mb-2 flex max-w-3xl items-center justify-between text-xs text-muted">
            <span>
              Editing — sending restarts the conversation from this point.
            </span>
            <button
              type="button"
              onClick={cancelEdit}
              className="ml-3 underline hover:text-ink"
            >
              Cancel
            </button>
          </div>
        )}
        <div className="gradient-border-glow mx-auto flex max-w-3xl items-end gap-2 rounded-[28px] border border-border bg-surface px-4 py-2 transition-shadow">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autosize();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything… (⌘/Ctrl+Enter to send, Shift+Enter for new line)"
            rows={1}
            aria-label="Message Cognera"
            className="max-h-[200px] flex-1 resize-none bg-transparent py-2.5 text-sm text-ink outline-none placeholder:text-muted"
          />
          {loading ? (
            <button
              type="button"
              onClick={handleStop}
              aria-label="Stop generating"
              className="btn-icon"
            >
              <Square size={13} strokeWidth={2} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send message"
              className="btn-icon"
            >
              <ArrowUp size={17} strokeWidth={2.25} />
            </button>
          )}
        </div>
        <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted">
          Cognera answers from your materials when available, or from general
          knowledge otherwise.
        </p>
      </form>
    </div>
  );
}
