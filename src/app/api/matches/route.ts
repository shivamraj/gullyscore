// GET  /api/matches?status=live  → match cards for the home page (status is optional)
// POST /api/matches              → create a match; returns the viewer link and the secret scoring link
//
// POST needs the header `x-owner-key: <uuid>` (the scorer's device key).

import { createMatch, listMatches, parseCreateMatchInput } from "@/lib/db/matches";
import { errorResponse, ownerKeyFrom, readJson } from "@/lib/db/types";

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
    const ownerKey = ownerKeyFrom(request);
    const input = parseCreateMatchInput(await readJson(request));
    const origin = new URL(request.url).origin;
    const result = await createMatch(ownerKey, input, origin);
    return Response.json(result, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
