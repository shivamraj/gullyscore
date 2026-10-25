"use client";

// The home page's list of matches, kept up to date as scores change.

import { useCallback, useEffect, useState } from "react";
import type { MatchCard } from "@/lib/db/types";
import { watchMatchList } from "@/lib/realtime";

export function useMatchList() {
  const [matches, setMatches] = useState<MatchCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/matches", { cache: "no-store" });
      const data = (await res.json()) as { matches?: MatchCard[]; error?: string };
      if (!res.ok || !data.matches) throw new Error(data.error ?? "Could not load matches.");
      setMatches(data.matches);
      setError(null);
    } catch (e) {
      // Keep showing the last list we had; only show the error if there's nothing to show.
      setError(e instanceof Error ? e.message : "Could not load matches.");
    }
  }, []);

  useEffect(() => {
    void load();
    let stop: (() => void) | undefined;
    try {
      stop = watchMatchList(() => void load());
    } catch {
      // Supabase not configured in the browser: the list still loads, just without live updates.
    }
    return () => stop?.();
  }, [load]);

  return { matches, error, reload: load };
}
