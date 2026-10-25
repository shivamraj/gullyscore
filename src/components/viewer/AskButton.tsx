"use client";

// Floating "Ask" button on the match page. Opens the chat panel. On phones it lines up with
// the edge of the scoreboard column; from 768 px wide it sits in the bottom-right corner.

import { useState } from "react";
import { AskPanel } from "./AskPanel";

export function AskButton({ matchId }: { matchId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-6 z-30 flex h-14 items-center gap-2 rounded-full bg-pitch pr-[22px] pl-[18px] text-base font-bold text-on-pitch shadow-[0_8px_24px_rgba(11,122,75,0.35)] min-[480px]:right-[calc(50%-224px+16px)] md:right-6 md:bottom-6"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
          </svg>
          Ask
        </button>
      )}
      {open && <AskPanel matchId={matchId} onClose={() => setOpen(false)} />}
    </>
  );
}
