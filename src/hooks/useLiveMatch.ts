"use client";

// One match's live state for viewers. Starts from what the server rendered, then follows every
// change (realtime, with a polling fallback; see src/lib/realtime.ts).

import { useEffect, useState } from "react";
import type { MatchState } from "@/engine";
import { watchMatchState, type StateRow } from "@/lib/realtime";

export function useLiveMatch(matchId: string, initial: StateRow) {
  const [row, setRow] = useState<StateRow>(initial);

  useEffect(() => {
    let stop: (() => void) | undefined;
    try {
      stop = watchMatchState(matchId, (next) => setRow((prev) => (next.updated_at >= prev.updated_at ? next : prev)));
    } catch {
      // Supabase not configured in the browser: show the server-rendered state only.
    }
    return () => stop?.();
  }, [matchId]);

  return { state: row.state as MatchState, updatedAt: row.updated_at };
}
