// GET  /api/teams  → the logged-in umpire's saved teams with players
// POST /api/teams  → create a team, or update one (when the body has an `id`)
//
// Both need an umpire login. Teams belong to the umpire (their user id is the team's owner_key).

import { listTeams, parseSaveTeamInput, saveTeam } from "@/lib/db/teams";
import { errorResponse, readJson } from "@/lib/db/types";
import { requireUmpire } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const umpire = await requireUmpire();
    return Response.json({ teams: await listTeams(umpire.id) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    const umpire = await requireUmpire();
    const input = parseSaveTeamInput(await readJson(request));
    const team = await saveTeam(umpire.id, input);
    return Response.json({ team }, { status: input.id ? 200 : 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
