// POST /api/balls/undo { matchId, seq } → deletes the last ball (seq must be the last ball's number)
// Needs the logged-in umpire who created the match.

import { requireScorer, undoLastBall } from "@/lib/db/balls";
import { ApiError, errorResponse, isUuid, readJson } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as Record<string, unknown>;
    const matchId = body?.matchId;
    if (!isUuid(matchId)) throw new ApiError(400, "matchId is required.");
    if (typeof body.seq !== "number" || !Number.isInteger(body.seq) || body.seq < 1) throw new ApiError(400, "seq is required.");
    await requireScorer(matchId);

    const state = await undoLastBall(matchId, body.seq);
    return Response.json({ lastSeq: state.lastSeq, status: state.status });
  } catch (e) {
    return errorResponse(e);
  }
}
