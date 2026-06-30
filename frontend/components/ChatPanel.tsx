"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, FileText, Pencil, Square, Info } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { apiPost } from "@/lib/api";
import WelcomeView from "@/components/WelcomeView";

type SourceChip = { document_id: string; document_title: string; snippet: string };
type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: SourceChip[];
};

const CONTEXT_WINDOW = 20; // messages sent as context — kept in sync with the note shown to the user

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Index of the user message currently being edited, if any. Editing and
  // resubmitting a past message "forks" the conversation: everything after
  // that point is discarded and replaced by the new exchange, the same
  // mental model ChatGPT/Gemini use for edited messages.
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Lets the Stop button cancel an in-flight request. A new controller is
  // created per request; calling .abort() on it cancels the fetch and flips
  // `loading` back off in the catch block below.
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function autosize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  function focusInput() {
    textareaRef.current?.focus();
  }

  async function sendQuestion(question: string, forkAtIndex?: number) {
    if (!question.trim() || loading) return;

    // If this send is a fork (editing a past message), drop everything from
    // that point forward before appending the edited message back in.
    setMessages((prev) => {
      const base = forkAtIndex !== undefined ? prev.slice(0, forkAtIndex) : prev;
      return [...base, { role: "user", content: question }];
    });

    setLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await apiPost<{ answer: string; sources: SourceChip[] }>(
        "/chat/ask",
        { question },
        controller.signal
      );
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.answer, sources: res.sources },
      ]);
      setInput(""); // only clear on success — see handleSend for the failure path
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // User hit Stop — quietly remove the pending user message rather
        // than leaving a question with no answer dangling in the thread.
        setMessages((prev) => prev.slice(0, -1));
      } else {
        // Failure (network, 4xx/5xx): restore the prompt into the input box
        // instead of leaving it lost, so the person can fix and resend
        // immediately. We also pop the optimistic user bubble back off.
        setMessages((prev) => prev.slice(0, -1));
        setInput(question);
        requestAnimationFrame(() => {
          autosize();
          focusInput();
        });
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
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
    const message = messages[index];
    if (message.role !== "user") return;
    setEditingIndex(index);
    setInput(message.content);
    requestAnimationFrame(() => {
      autosize();
      focusInput();
    });
  }

  function cancelEdit() {
    setEditingIndex(null);
    setInput("");
  }

  function handleQuickStart(prompt: string) {
    setInput(prompt);
    requestAnimationFrame(() => {
      autosize();
      focusInput();
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl + Enter: send. Shift + Enter: newline (default textarea
    // behavior, so we just let it through). Plain Enter also sends, since
    // that matches the convention most chat apps already use.
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
      if (editingIndex !== null) {
        cancelEdit();
      } else {
        textareaRef.current?.blur();
      }
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
          {messages.length === 0 ? (
            <WelcomeView onQuickStart={handleQuickStart} />
          ) : (
            <div
              className="mb-6 flex items-center gap-1.5 text-xs text-muted"
              role="note"
            >
              <Info size={13} strokeWidth={1.75} />
              <span>Using the last {CONTEXT_WINDOW} messages for context</span>
            </div>
          )}

          <div className="flex flex-col gap-7">
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "group flex justify-end" : "group"}
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
                    <div className="rounded-3xl bg-surface px-4 py-2.5 text-sm text-ink">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div className="max-w-[90%] text-sm leading-relaxed text-ink">
                    <div className="prose prose-invert prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-li:my-0.5">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
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
            <span>Editing a previous message — sending will restart the conversation from here.</span>
            <button
              type="button"
              onClick={cancelEdit}
              className="ml-3 flex-shrink-0 underline hover:text-ink"
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
            placeholder="Ask a question about your materials… (⌘/Ctrl + Enter to send)"
            rows={1}
            aria-label="Message Cognera"
            className="max-h-[200px] flex-1 resize-none bg-transparent py-2.5 text-sm text-ink outline-none placeholder:text-muted"
          />

          {loading ? (
            <button
              type="button"
              onClick={handleStop}
              aria-label="Stop generating"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border bg-bg text-ink transition-colors hover:bg-surface"
            >
              <Square size={14} strokeWidth={2} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send message"
              className="gradient-bg flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-30"
            >
              <ArrowUp size={18} strokeWidth={2.25} />
            </button>
          )}
        </div>
        <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted">
          Cognera can make mistakes. Answers are grounded in your uploaded materials.
        </p>
      </form>
    </div>
  );
}
