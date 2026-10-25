// Supabase client for the browser: read-only data, realtime subscriptions, and the umpire's
// Google sign-in. Uses the public anon key; row-level security (supabase/schema.sql) allows reads only.
//
// The login session is kept in cookies (not localStorage), so the server can also see who is
// logged in: see src/lib/supabase/auth.ts.

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
    );
  }

  browserClient = createBrowserClient(url, anonKey, {
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return browserClient;
}
