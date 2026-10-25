"use client";

// "12 watching" badge (VIEW-09 on the match page, SCR-16 on the scorer screen).
// Viewers are counted with Supabase presence (see watchViewers in src/lib/realtime.ts).

import { useEffect, useState } from "react";
import { watchViewers } from "@/lib/realtime";

export function useViewerCount(matchId: string, role: "viewer" | "scorer"): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let stop: (() => void) | undefined;
    try {
      stop = watchViewers(matchId, role, setCount);
    } catch {
      // Supabase isn't configured in the browser: no count.
    }
    return () => stop?.();
  }, [matchId, role]);
  return count;
}

export function ViewerCount({ matchId, role, className = "" }: { matchId: string; role: "viewer" | "scorer"; className?: string }) {
  const count = useViewerCount(matchId, role);
  if (count === null) return null;
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${className}`} aria-live="polite" title="People watching this match now">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      {count.toLocaleString("en-IN")} watching
    </span>
  );
}
