// /match/new — match setup, step by step. Umpires only: not logged in → the login page first.
// The form itself runs in the browser.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MatchSetupForm } from "@/components/setup/MatchSetupForm";
import { currentUmpire } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New match" };

export default async function NewMatchPage() {
  if (!(await currentUmpire())) redirect("/login?next=/match/new");
  return (
    <div className="mx-auto max-w-md">
      <MatchSetupForm />
    </div>
  );
}
