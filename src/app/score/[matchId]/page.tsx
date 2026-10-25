// /score/[matchId] — the scorer's screen. Only the umpire who created the match can use it:
// not logged in → the login page (and back here after); someone else → a polite "not yours".
// The server checks the same thing again on every ball, undo and end of innings.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isMatchOwner, loadScoringData } from "@/lib/db/balls";
import { isUuid } from "@/lib/db/types";
import { currentUmpire, type Umpire } from "@/lib/supabase/auth";
import { ScorerPanel } from "@/components/scorer/ScorerPanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Scoring",
  robots: { index: false, follow: false },
};

function Message({ title, text, viewerHref }: { title: string; text: string; viewerHref?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-ink-muted">{text}</p>
      {viewerHref && (
        <Link href={viewerHref} className="font-semibold text-pitch underline">
          Watch this match
        </Link>
      )}
      <Link href="/" className="font-semibold text-pitch underline">
        Go to home
      </Link>
    </main>
  );
}

export default async function ScorePage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  if (!isUuid(matchId)) return <Message title="Match not found" text="Check the link and try again." />;

  let umpire: Umpire | null;
  let owner = false;
  try {
    umpire = await currentUmpire();
    if (umpire) owner = await isMatchOwner(matchId, umpire.id);
  } catch (e) {
    const text = e instanceof Error && e.name === "ConfigError" ? e.message : "Could not reach the database. Try again.";
    return <Message title="Something went wrong" text={text} />;
  }
  if (!umpire) redirect(`/login?next=${encodeURIComponent(`/score/${matchId}`)}`);
  if (!owner) {
    return (
      <Message
        title="This isn't your match to score"
        text="Only the umpire who created a match can score it. You can still watch it live."
        viewerHref={`/match/${matchId}`}
      />
    );
  }

  const { match, config, balls } = await loadScoringData(matchId);
  return <ScorerPanel matchId={matchId} token="" title={match.title} config={config} initialBalls={balls} />;
}
