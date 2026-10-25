// Supabase client for API routes only. Uses the SECRET service role key, which bypasses
// row-level security, so it must never be imported into a browser component.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serverClient: SupabaseClient | null = null;

export class ConfigError extends Error {
  override name = "ConfigError";
}

export function getServerSupabase(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("getServerSupabase() was called in the browser. Use getBrowserSupabase() instead.");
  }
  if (serverClient) return serverClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new ConfigError(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    );
  }

  serverClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serverClient;
}
