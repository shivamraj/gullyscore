// Offline-safe sending of balls from the scorer's phone.
//
// Every tap is saved to localStorage first, then sent to the server one at a time, in order.
// If the network drops, the queue keeps the balls and retries (and retries at once when the
// phone comes back online). Each ball carries a clientId, so a retry of a ball the server
// already has is harmless.

import type { BallEvent } from "@/engine";

export interface QueuedBall {
  clientId: string;
  ball: BallEvent;
}

export type SyncStatus =
  | { kind: "saved" }
  | { kind: "sending"; count: number }
  | { kind: "offline"; count: number }
  | { kind: "error"; message: string };

interface Options {
  matchId: string;
  token: string;
  onStatus: (s: SyncStatus) => void;
  /** The server refused a ball (rules or out of date). The queue is cleared; reload from the server. */
  onRejected: (message: string) => void;
}

const MAX_BACKOFF_MS = 30_000;

export class BallQueue {
  private items: QueuedBall[];
  private sending = false;
  private backoff = 1_000;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private readonly key: string;
  private readonly onOnline = () => {
    this.backoff = 1_000;
    void this.flush();
  };

  constructor(private readonly opts: Options) {
    this.key = `gullyscore.queue.${opts.matchId}`;
    this.items = this.read();
    if (typeof window !== "undefined") window.addEventListener("online", this.onOnline);
  }

  /** Balls not yet confirmed by the server, oldest first. */
  pending(): QueuedBall[] {
    return [...this.items];
  }

  /** Drops queued balls the server already has (seq at or below its last seq). */
  dropUpTo(lastServerSeq: number): void {
    this.items = this.items.filter((q) => q.ball.seq > lastServerSeq);
    this.write();
  }

  add(item: QueuedBall): void {
    this.items.push(item);
    this.write();
    void this.flush();
  }

  /** Removes the newest unsent ball (used by undo). Returns it, or undefined if all are sent. */
  removeLast(): QueuedBall | undefined {
    if (this.sending && this.items.length === 1) return undefined; // already on its way
    const item = this.items.pop();
    this.write();
    this.report();
    return item;
  }

  /** Whether everything has reached the server. */
  isEmpty(): boolean {
    return this.items.length === 0;
  }

  start(): void {
    this.report();
    void this.flush();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (typeof window !== "undefined") window.removeEventListener("online", this.onOnline);
  }

  clear(): void {
    this.items = [];
    this.write();
    this.report();
  }

  private read(): QueuedBall[] {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? (JSON.parse(raw) as QueuedBall[]) : [];
    } catch {
      return [];
    }
  }

  private write(): void {
    try {
      if (this.items.length) localStorage.setItem(this.key, JSON.stringify(this.items));
      else localStorage.removeItem(this.key);
    } catch {
      // Storage full or blocked: the queue still works for this visit.
    }
  }

  private report(offline = false): void {
    const count = this.items.length;
    if (count === 0) this.opts.onStatus({ kind: "saved" });
    else this.opts.onStatus(offline ? { kind: "offline", count } : { kind: "sending", count });
  }

  private async flush(): Promise<void> {
    if (this.sending || this.stopped) return;
    this.sending = true;
    try {
      while (this.items.length && !this.stopped) {
        this.report();
        const item = this.items[0]!;
        let res: Response;
        try {
          res = await fetch("/api/balls", {
            method: "POST",
            headers: { "content-type": "application/json", "x-scoring-token": this.opts.token },
            body: JSON.stringify({ matchId: this.opts.matchId, clientId: item.clientId, ball: item.ball }),
          });
        } catch {
          // No network: keep the ball, try again later.
          this.report(true);
          this.retryLater();
          return;
        }

        if (res.ok) {
          this.items.shift();
          this.write();
          this.backoff = 1_000;
          continue;
        }

        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status >= 500) {
          this.report(true);
          this.retryLater();
          return;
        }
        // 4xx: the server won't accept this ball. Later balls depend on it, so drop them all.
        this.items = [];
        this.write();
        this.opts.onStatus({ kind: "error", message: data.error ?? `Ball not saved (${res.status}).` });
        this.opts.onRejected(data.error ?? "The server did not accept the last ball.");
        return;
      }
      this.report();
    } finally {
      this.sending = false;
    }
  }

  private retryLater(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.backoff);
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
  }
}
