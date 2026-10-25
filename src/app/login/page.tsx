// /login?next=/umpire — umpire sign-in with Google. Viewers never need this page.
// Already logged in? Straight on to where they were going.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GoogleSignIn } from "@/components/auth/AuthButtons";
import { currentUmpire, safeNext } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Umpire login" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNext(rawNext);
  if (await currentUmpire()) redirect(next);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-5 py-10">
      <Link href="/" className="flex items-center gap-2.5 self-center" aria-label="GullyScore home">
        <span className="flex size-11 items-center justify-center rounded-xl bg-pitch" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="8" />
            <path d="M8.5 6.5c2 3.5 2 7.5 0 11" />
            <path d="M15.5 6.5c-2 3.5-2 7.5 0 11" />
          </svg>
        </span>
        <span className="font-score text-3xl font-bold tracking-wide">GullyScore</span>
      </Link>

      <section className="flex flex-col gap-5 rounded-3xl border border-line bg-surface p-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold">Umpire login</h1>
          <p className="text-[15px] text-ink-muted">Log in to create matches and score them ball by ball. Only you can score the matches you create.</p>
        </div>
        <GoogleSignIn next={next} initialError={error} />
      </section>

      <p className="text-center text-sm text-ink-muted">
        Just watching?{" "}
        <Link href="/" className="font-semibold text-pitch underline">
          See live matches
        </Link>{" "}
        — no login needed.
      </p>
    </main>
  );
}
