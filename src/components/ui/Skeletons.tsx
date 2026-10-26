// Loading screens shown the instant a page is opened, shaped like the page that's coming, so a
// tap gets an immediate response. Used by the loading.tsx files next to each page.

function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-surface-2 ${className}`} />;
}

function Status({ text }: { text: string }) {
  return (
    <p role="status" className="sr-only">
      {text}
    </p>
  );
}

/** The scorer: dark summary strip, then the 4×4 button grid. */
export function ScorerSkeleton() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col md:max-w-2xl md:landscape:grid md:landscape:h-dvh md:landscape:max-w-6xl md:landscape:grid-cols-2">
      <Status text="Opening the scorer…" />
      <section className="flex flex-col gap-3 bg-[#0f1a14] px-4 pt-4 pb-4 md:landscape:h-full md:landscape:p-6">
        <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
        <div className="h-14 w-36 animate-pulse rounded-lg bg-white/15" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-10 animate-pulse rounded-[10px] bg-white/10" />
          <div className="h-10 animate-pulse rounded-[10px] bg-white/10" />
        </div>
        <div className="h-4 w-52 animate-pulse rounded bg-white/10" />
      </section>
      <div className="grid flex-1 grid-cols-4 grid-rows-4 gap-2.5 px-4 pt-3 pb-6" style={{ minHeight: 360 }}>
        {Array.from({ length: 16 }, (_, i) => (
          <Block key={i} className="rounded-[18px]" />
        ))}
      </div>
    </div>
  );
}

/** A match page: header, score card, rates, this over, batters. */
export function MatchSkeleton() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-2.5 px-4 pt-4 pb-28 md:max-w-3xl md:px-6 lg:max-w-6xl">
      <Status text="Loading the match…" />
      <div className="flex items-center justify-between pb-1">
        <Block className="size-11 rounded-xl" />
        <Block className="h-8 w-40 rounded-lg" />
        <Block className="size-11 rounded-xl" />
      </div>
      <div className="flex flex-col gap-2.5 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2.5">
          <div className="h-[150px] animate-pulse rounded-[20px] bg-scoreboard opacity-90" />
          <Block className="h-[72px]" />
          <Block className="h-[100px]" />
          <Block className="h-[160px]" />
        </div>
        <Block className="hidden h-[380px] md:block" />
      </div>
    </main>
  );
}

/** A list page (My matches, setup): header and a few cards. */
export function ListSkeleton({ label }: { label: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 pt-5 pb-10 md:max-w-3xl md:px-8 lg:max-w-6xl">
      <Status text={label} />
      <div className="flex items-center justify-between">
        <Block className="h-11 w-48 rounded-xl" />
        <Block className="h-11 w-24 rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:max-w-md">
        <Block className="h-14" />
        <Block className="h-14" />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        <Block className="h-40" />
        <Block className="h-40" />
      </div>
    </main>
  );
}
