// Placeholder home page for Phase 0.
// Phase 4 (PR 7) replaces this with the live match list.

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-10">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-pitch" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="8" />
            <path d="M8.5 6.5c2 3.5 2 7.5 0 11" />
            <path d="M15.5 6.5c-2 3.5-2 7.5 0 11" />
          </svg>
        </div>
        <h1 className="font-score text-3xl font-bold tracking-wide">GullyScore</h1>
      </div>

      <section className="rounded-3xl bg-scoreboard p-5 text-white">
        <p className="text-sm text-white/70">Setup check</p>
        <p className="font-score text-6xl leading-none font-bold">0/0</p>
        <p className="mt-1 font-score text-xl text-white/70">0.0 ov</p>
        <p className="mt-4 rounded-xl bg-white/10 px-3 py-2 font-semibold text-emerald-300">
          Phase 0 is working. Next up: the scoring engine.
        </p>
      </section>

      <ul className="grid grid-cols-3 gap-2 text-center text-sm font-semibold">
        <li className="rounded-xl border border-line bg-surface py-3">Next.js</li>
        <li className="rounded-xl border border-line bg-surface py-3">TypeScript</li>
        <li className="rounded-xl border border-line bg-surface py-3">Tailwind</li>
      </ul>

      <p className="text-center text-sm text-ink-muted">
        Switch your phone between light and dark mode to check both themes.
      </p>
    </main>
  );
}
