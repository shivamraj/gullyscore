// GET  /api/teams  → this device's saved teams with players
// POST /api/teams  → create a team, or update one (when the body has an `id`)
//
// Both need the header `x-owner-key: <uuid>`: a random key the app keeps on the scorer's device.

import { listTeams, parseSaveTeamInput, saveTeam } from "@/lib/db/teams";
import { errorResponse, ownerKeyFrom, readJson } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ownerKey = ownerKeyFrom(request);
    return Response.json({ teams: await listTeams(ownerKey) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    const ownerKey = ownerKeyFrom(request);
    const input = parseSaveTeamInput(await readJson(request));
    const team = await saveTeam(ownerKey, input);
    return Response.json({ team }, { status: input.id ? 200 : 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
