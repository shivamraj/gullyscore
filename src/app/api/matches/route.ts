// GET  /api/matches?status=live  → match cards for the home page (status is optional)
// POST /api/matches              → create a match; returns its viewer and scorer links
//
// GET is public. POST needs an umpire login; the umpire who creates a match is its only scorer.

import { createMatch, listMatches, parseCreateMatchInput } from "@/lib/db/matches";
import { errorResponse, readJson } from "@/lib/db/types";
import { requireUmpire } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const status = new URL(request.url).searchParams.get("status") ?? undefined;
    return Response.json({ matches: await listMatches(status) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    const umpire = await requireUmpire();
    const input = parseCreateMatchInput(await readJson(request));
    const origin = new URL(request.url).origin;
    const result = await createMatch(umpire.id, input, origin);
    return Response.json(result, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
