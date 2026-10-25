"use client";

// Chat panel for asking about the match. On phones it slides up over about two-thirds of the
// screen so the score stays visible above it. On tablets and desktop (768 px and wider) it opens
// as a chat window in the bottom-right corner, beside the scoreboard. Quick-question chips for
// the common questions.

import { useEffect, useRef, useState } from "react";
import { newId } from "@/lib/apiClient";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  asOf?: string;
  error?: boolean;
}

const CHIPS = ["Score?", "Who's batting?", "Who's next?", "Last over?", "Run rate?", "Top scorer?", "score kya hai?"];
const VIEWER_KEY = "gullyscore.viewer";

function viewerId(): string {
  try {
    let id = localStorage.getItem(VIEWER_KEY);
    if (!id) {
      id = newId();
      localStorage.setItem(VIEWER_KEY, id);
    }
    return id;
  } catch {
    return "anonymous";
  }
}

export function AskPanel({ matchId, onClose }: { matchId: string; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history = messages.filter((m) => !m.error).slice(-4).map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, { id: newId(), role: "user", text: q }]);
    setDraft("");
    setBusy(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json", "x-viewer-id": viewerId() },
        body: JSON.stringify({ matchId, question: q, history }),
      });
      const data = (await res.json().catch(() => ({}))) as { answer?: string; asOf?: string; error?: string };
      if (!res.ok || !data.answer) throw new Error(data.error ?? "Couldn't get an answer. Try again.");
      setMessages((prev) => [...prev, { id: newId(), role: "assistant", text: data.answer!, asOf: data.asOf }]);
    } catch (e) {
      const text = e instanceof TypeError ? "You're offline. Check your connection and try again." : e instanceof Error ? e.message : "Something went wrong.";
      setMessages((prev) => [...prev, { id: newId(), role: "assistant", text, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/35 md:items-end md:bg-black/10 md:p-6" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Ask about the match"
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex h-[68dvh] w-full max-w-md flex-col rounded-t-3xl border-t border-line bg-surface shadow-[0_-12px_40px_rgba(0,0,0,0.25)] md:mx-0 md:h-[min(640px,calc(100dvh-48px))] md:w-[400px] md:rounded-3xl md:border md:shadow-[0_16px_48px_rgba(0,0,0,0.25)]"
      >
        <span className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line md:invisible" aria-hidden="true" />
        <div className="flex items-center justify-between px-5 pt-2 pb-3">
          <div>
            <h2 className="text-lg font-bold">Ask about the match</h2>
            <p className="text-[13px] text-ink-muted">Answers come from the live scorecard</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 items-center justify-center rounded-xl bg-surface-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-1" aria-live="polite">
          {messages.length === 0 && (
            <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[15px] text-ink-muted">
              Ask anything about this match, in English or Hindi: the score, who&apos;s batting, how many are needed, who&apos;s next…
            </p>
          )}
          {messages.map((m) =>
            m.role === "user" ? (
              <p key={m.id} className="max-w-[80%] self-end rounded-[16px_16px_4px_16px] bg-pitch px-3.5 py-2.5 text-[15px] text-on-pitch">
                {m.text}
              </p>
            ) : (
              <div key={m.id} className="flex max-w-[88%] flex-col gap-1 self-start">
                <p
                  className={`rounded-[16px_16px_16px_4px] px-3.5 py-3 text-[15px] leading-snug ${
                    m.error ? "bg-wicket/10 font-semibold text-wicket" : "bg-surface-2"
                  }`}
                >
                  {m.text}
                </p>
                {m.asOf && <span className="pl-1 text-xs text-ink-muted">as of {m.asOf} ov</span>}
              </div>
            ),
          )}
          {busy && (
            <div className="flex gap-1.5 self-start rounded-2xl bg-surface-2 px-3.5 py-3.5" aria-label="Thinking">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-2 animate-pulse rounded-full bg-ink-muted" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto px-4 pt-2.5 pb-1" aria-label="Quick questions">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={busy}
              onClick={() => void ask(c)}
              className="h-9 shrink-0 rounded-full border border-line px-3.5 text-sm font-semibold disabled:opacity-50"
            >
              {c}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2 px-4 pt-2 pb-6"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(draft);
            inputRef.current?.focus();
          }}
        >
          <label htmlFor="ask-input" className="sr-only">
            Your question
          </label>
          <input
            id="ask-input"
            ref={inputRef}
            value={draft}
            maxLength={300}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask in English or Hindi…"
            autoComplete="off"
            className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-ground px-3.5 text-[15px] text-ink outline-none placeholder:text-ink-muted focus:border-pitch"
          />
          <button
            type="submit"
            aria-label="Send question"
            disabled={!draft.trim() || busy}
            className="flex size-12 items-center justify-center rounded-xl bg-pitch text-on-pitch disabled:opacity-50"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
      </section>
    </div>
  );
}
