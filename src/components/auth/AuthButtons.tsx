"use client";

// Umpire login pieces used in the browser: the Google sign-in button, sign out, the logged-in
// state for the home page header, and moving matches made on this phone to the umpire's account.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { buttonClasses } from "@/components/ui/Button";

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Is Google sign-in switched on in Supabase? (Public settings endpoint; no key needed beyond anon.) */
async function googleEnabled(): Promise<boolean | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } });
    if (!res.ok) return null;
    const settings = (await res.json()) as { external?: { google?: boolean } };
    return Boolean(settings.external?.google);
  } catch {
    return null; // offline or blocked: let the sign-in attempt itself report the problem
  }
}

export function GoogleSignIn({ next, initialError }: { next: string; initialError?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? "");

  async function signIn() {
    setBusy(true);
    setError("");
    if ((await googleEnabled()) === false) {
      setError("Google sign-in isn't switched on yet. The app owner needs to finish the Google setup in Supabase (see the README).");
      setBusy(false);
      return;
    }
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error: e } = await getBrowserSupabase().auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (e) {
      setError(e.message);
      setBusy(false);
    }
    // On success the browser is already on its way to Google.
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => void signIn()}
        disabled={busy}
        className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-line bg-surface text-base font-bold text-ink shadow-sm disabled:opacity-60"
      >
        <GoogleLogo />
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && (
        <p role="alert" className="rounded-xl bg-wicket/10 px-3 py-2.5 text-sm font-semibold text-wicket">
          {error}
        </p>
      )}
    </div>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await getBrowserSupabase().auth.signOut();
        router.replace("/");
        router.refresh();
      }}
      aria-label="Log out"
      className={buttonClasses("secondary", "md", "w-11 px-0 sm:w-auto sm:px-3.5")}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
        <path d="M10 17l-5-5 5-5M5 12h11" />
      </svg>
      <span className="hidden sm:inline">{busy ? "Logging out…" : "Log out"}</span>
    </button>
  );
}

/** Logged-in state for client pages (header buttons). `null` while still checking. */
export function useUmpireSession(): { loggedIn: boolean } | null {
  const [state, setState] = useState<{ loggedIn: boolean } | null>(null);
  useEffect(() => {
    let sb;
    try {
      sb = getBrowserSupabase();
    } catch {
      setState({ loggedIn: false });
      return;
    }
    void sb.auth.getSession().then(({ data }) => setState({ loggedIn: Boolean(data.session) }));
    const { data } = sb.auth.onAuthStateChange((_event, session) => setState({ loggedIn: Boolean(session) }));
    return () => data.subscription.unsubscribe();
  }, []);
  return state;
}

// Matches created before logins existed belong to this phone's device key (see src/lib/apiClient.ts).
const DEVICE_KEY_STORAGE = "gullyscore.ownerKey";

/** Moves this phone's earlier matches to the umpire's account, then refreshes the list. */
export function ClaimDeviceMatches({ claim }: { claim: (deviceKey: string) => Promise<number> }) {
  const router = useRouter();
  useEffect(() => {
    let key: string | null = null;
    try {
      key = localStorage.getItem(DEVICE_KEY_STORAGE);
    } catch {
      return;
    }
    if (!key) return;
    void claim(key)
      .then((moved) => moved > 0 && router.refresh())
      .catch(() => {
        // Not important enough to bother the umpire; it retries on the next visit.
      });
  }, [claim, router]);
  return null;
}
