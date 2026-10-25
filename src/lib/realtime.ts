// Live updates for viewers.
//
// Viewers listen to `match_state_cache`: the server rewrites that row (the full calculated state)
// after every ball, undo or end of innings, so a viewer always shows exactly what the server has.
// Supabase Realtime pushes the change within about a second. If realtime can't connect (blocked
// network, free-tier connection limit), we fall back to polling, and we also refresh whenever the
// tab comes back to the foreground.

import type { MatchState } from "@/engine";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { countViewers } from "@/lib/fx/events";

export interface StateRow {
  state: MatchState;
  updated_at: string;
}

type Stop = () => void;

const POLL_WHEN_OFFLINE_MS = 4_000;
const LIST_POLL_MS = 15_000;

/** Calls `onState` with every new state of one match. Returns a function that stops watching. */
export function watchMatchState(matchId: string, onState: (row: StateRow) => void): Stop {
  const sb = getBrowserSupabase();
  let lastUpdate = "";
  let live = false;
  let stopped = false;

  const apply = (row: StateRow | null | undefined) => {
    if (!row?.state || stopped) return;
    if (row.updated_at && row.updated_at <= lastUpdate) return; // old or duplicate
    lastUpdate = row.updated_at ?? lastUpdate;
    onState(row);
  };

  const fetchNow = async () => {
    const { data } = await sb.from("match_state_cache").select("state, updated_at").eq("match_id", matchId).maybeSingle();
    apply(data as StateRow | null);
  };

  const channel = sb
    .channel(`match-state:${matchId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "match_state_cache", filter: `match_id=eq.${matchId}` },
      (payload) => apply(payload.new as StateRow),
    )
    .subscribe((status) => {
      const wasLive = live;
      live = status === "SUBSCRIBED";
      if (live && !wasLive) void fetchNow(); // catch anything missed while connecting
    });

  const timer = setInterval(() => {
    if (!live) void fetchNow();
  }, POLL_WHEN_OFFLINE_MS);
  const onVisible = () => document.visibilityState === "visible" && void fetchNow();
  document.addEventListener("visibilitychange", onVisible);
  void fetchNow();

  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
    void sb.removeChannel(channel);
  };
}

/**
 * Calls `onChange` whenever any match's score or status changes, or a match is created,
 * so the home page can refresh. Changes are bunched together (at most one refresh a second).
 */
export function watchMatchList(onChange: () => void): Stop {
  const sb = getBrowserSupabase();
  let live = false;
  let pending: ReturnType<typeof setTimeout> | null = null;
  const bump = () => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      onChange();
    }, 1_000);
  };

  const channel = sb
    .channel("match-list")
    .on("postgres_changes", { event: "*", schema: "public", table: "match_state_cache" }, bump)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "matches" }, bump)
    .subscribe((status) => {
      live = status === "SUBSCRIBED";
    });

  const timer = setInterval(() => {
    if (!live) onChange();
  }, LIST_POLL_MS);
  const onVisible = () => document.visibilityState === "visible" && onChange();
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    clearInterval(timer);
    if (pending) clearTimeout(pending);
    document.removeEventListener("visibilitychange", onVisible);
    void sb.removeChannel(channel);
  };
}

/**
 * Live viewer count (VIEW-09, SCR-16), using Supabase Realtime presence: every open viewer tab
 * joins the match's presence channel, so nothing is stored in the database. The scorer joins
 * as "scorer" and isn't counted. Calls `onCount` with the number of viewers, or null when
 * presence can't connect (the count is then hidden rather than wrong).
 */
export function watchViewers(matchId: string, role: "viewer" | "scorer", onCount: (count: number | null) => void): Stop {
  const sb = getBrowserSupabase();
  const key = `${role}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  const channel = sb.channel(`viewers:${matchId}`, { config: { presence: { key } } });

  channel
    .on("presence", { event: "sync" }, () => {
      onCount(countViewers(channel.presenceState<{ role?: string }>()));
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") void channel.track({ role });
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onCount(null);
    });

  return () => {
    void channel.untrack();
    void sb.removeChannel(channel);
  };
}
