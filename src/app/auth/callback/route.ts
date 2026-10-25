// GET /auth/callback?code=…&next=/umpire
//
// Google sends the umpire back here (through Supabase) after they sign in. We swap the one-time
// code for a session (stored in cookies), then go to the page they were heading for.

import { NextResponse } from "next/server";
import { getAuthSupabase, safeNext } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (code) {
    const sb = await getAuthSupabase();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  const reason = url.searchParams.get("error_description") ?? "Sign-in didn't finish. Please try again.";
  const back = new URL("/login", url.origin);
  back.searchParams.set("error", reason.slice(0, 200));
  back.searchParams.set("next", next);
  return NextResponse.redirect(back);
}
