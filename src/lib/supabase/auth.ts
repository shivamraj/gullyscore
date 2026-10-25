// Who is logged in, on the server (pages and API routes).
//
// Umpires sign in with Google through Supabase Auth. The session lives in cookies set by the
// browser client, so every request to our server carries it. getUser() asks Supabase to confirm
// the session is real (a cookie alone isn't trusted). Viewers never log in.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ApiError } from "@/lib/db/types";

export interface Umpire {
  /** Supabase user id. Stored as `owner_key` on the umpire's matches and teams. */
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

/** A Supabase client that reads and refreshes the login session from this request's cookies. */
export async function getAuthSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new ApiError(500, "Supabase is not configured.");
  const store = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Pages can't set cookies while rendering; the browser refreshes the session itself.
        }
      },
    },
  });
}

/** The logged-in umpire, or null. */
export async function currentUmpire(): Promise<Umpire | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const sb = await getAuthSupabase();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const email = data.user.email ?? "";
  const name = (typeof meta.full_name === "string" && meta.full_name) || (typeof meta.name === "string" && meta.name) || email.split("@")[0] || "Umpire";
  const avatar = typeof meta.avatar_url === "string" ? meta.avatar_url : typeof meta.picture === "string" ? meta.picture : null;
  return { id: data.user.id, name, email, avatarUrl: avatar };
}

/** The logged-in umpire; API routes answer 401 when nobody is. */
export async function requireUmpire(): Promise<Umpire> {
  const umpire = await currentUmpire();
  if (!umpire) throw new ApiError(401, "Log in as an umpire first.");
  return umpire;
}

/** Only same-site paths are allowed as the page to return to after login. */
export function safeNext(next: string | null | undefined, fallback = "/umpire"): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}
