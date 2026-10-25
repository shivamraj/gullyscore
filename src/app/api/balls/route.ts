// GET  /api/balls?matchId=…            → all balls of a match (the scorer reloads with this)
// POST /api/balls { matchId, clientId, ball } → save one ball
//
// POST needs the header `x-scoring-token: <token from the scoring link>`.

import { listBalls, parseBall, requireScoringToken, saveBall } from "@/lib/db/balls";
import { ApiError, errorResponse, isUuid, readJson } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const matchId = new URL(request.url).searchParams.get("matchId");
    if (!isUuid(matchId)) throw new ApiError(400, "matchId is required.");
    return Response.json({ balls: await listBalls(matchId) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as Record<string, unknown>;
    const matchId = body?.matchId;
    if (!isUuid(matchId)) throw new ApiError(400, "matchId is required.");
    await requireScoringToken(matchId, request.headers.get("x-scoring-token"));

    const ball = parseBall(body.ball);
    const result = await saveBall(matchId, ball, String(body.clientId ?? ""));
    return Response.json(
      { lastSeq: result.state.lastSeq, status: result.state.status, duplicate: result.duplicate },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
