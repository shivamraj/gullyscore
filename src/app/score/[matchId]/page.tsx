// /score/[matchId]?t=<token> — the scorer's screen. Only works with the secret scoring link.
// The token is checked on the server before anything is shown, and again on every ball saved.

import type { Metadata } from "next";
import Link from "next/link";
import { isValidScoringToken, loadScoringData } from "@/lib/db/balls";
import { ScorerPanel } from "@/components/scorer/ScorerPanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Scoring",
  // The link contains the secret token: keep it out of search engines and referrer headers.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function Message({ title, text }: { title: string; text: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-ink-muted">{text}</p>
      <Link href="/" className="font-semibold text-pitch underline">
        Go to home
      </Link>
    </main>
  );
}

export default async function ScorePage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { matchId } = await params;
  const { t: token } = await searchParams;

  let valid = false;
  try {
    valid = await isValidScoringToken(matchId, token);
  } catch (e) {
    const text = e instanceof Error && e.name === "ConfigError" ? e.message : "Could not reach the database. Try again.";
    return <Message title="Something went wrong" text={text} />;
  }
  if (!valid || !token) {
    return <Message title="This scoring link isn't valid" text="Open the full scoring link you got when the match was created." />;
  }

  const { match, config, balls } = await loadScoringData(matchId);
  return <ScorerPanel matchId={matchId} token={token} title={match.title} config={config} initialBalls={balls} />;
}
