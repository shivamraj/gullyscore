// POST /api/matches/<matchId>/end-innings { innings: 1 | 2 } → closes that innings early
// Needs the logged-in umpire who created the match.

import { endInnings, requireScorer } from "@/lib/db/balls";
import { ApiError, errorResponse, isUuid, readJson } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await params;
    if (!isUuid(matchId)) throw new ApiError(400, "matchId is required.");
    await requireScorer(matchId);
    const body = (await readJson(request)) as Record<string, unknown>;
    if (body?.innings !== 1 && body?.innings !== 2) throw new ApiError(400, "innings must be 1 or 2.");

    const state = await endInnings(matchId, body.innings);
    return Response.json({ status: state.status, target: state.target ?? null });
  } catch (e) {
    return errorResponse(e);
  }
}
