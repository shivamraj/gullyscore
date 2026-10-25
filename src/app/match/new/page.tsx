// /match/new — match setup, step by step. The form itself runs in the browser.

import type { Metadata } from "next";
import { MatchSetupForm } from "@/components/setup/MatchSetupForm";

export const metadata: Metadata = { title: "New match" };

export default function NewMatchPage() {
  return (
    <div className="mx-auto max-w-md">
      <MatchSetupForm />
    </div>
  );
}
