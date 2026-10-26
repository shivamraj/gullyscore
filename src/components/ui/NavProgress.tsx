"use client";

// A thin bar across the top of the screen that appears the moment a link is tapped and finishes
// when the new page is showing, so a tap never feels ignored while the next page loads.
//
// It watches taps on same-site links (plus anything that calls startNavProgress(), e.g. after
// creating a match) and stops when the address changes. A safety timeout hides it after 15 s.

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const START_EVENT = "gullyscore:nav-start";

/** Show the bar for a navigation started in code (router.push / replace). */
export function startNavProgress(): void {
  window.dispatchEvent(new Event(START_EVENT));
}

function isPlainInternalClick(e: MouseEvent): string | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = (e.target as Element | null)?.closest?.("a");
  if (!a || !a.href || (a.target && a.target !== "_self") || a.hasAttribute("download")) return null;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  const here = window.location.pathname + window.location.search;
  if (url.pathname + url.search === here) return null; // same page (or only a #hash change)
  return url.pathname;
}

export function NavProgress() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle");
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const start = () => {
      setPhase("loading");
      if (safety.current) clearTimeout(safety.current);
      safety.current = setTimeout(() => setPhase("idle"), 15_000);
    };
    const onClick = (e: MouseEvent) => {
      if (isPlainInternalClick(e)) start();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener(START_EVENT, start);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(START_EVENT, start);
    };
  }, []);

  // The address changed: the new page is on screen. Finish the bar, then hide it.
  useEffect(() => {
    setPhase((p) => (p === "loading" ? "done" : p));
    const t = setTimeout(() => setPhase("idle"), 350);
    if (safety.current) clearTimeout(safety.current);
    return () => clearTimeout(t);
  }, [pathname]);

  if (phase === "idle") return null;
  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className={`h-full bg-pitch shadow-[0_0_8px_var(--pitch)] ${phase === "loading" ? "nav-progress-run" : "nav-progress-done"}`} />
    </div>
  );
}
