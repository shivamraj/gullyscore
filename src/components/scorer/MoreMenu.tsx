"use client";

// "More" on the scorer screen: voice language or off, end the innings early, open the viewer page.

import Link from "next/link";
import { useState } from "react";
import type { VoiceSetting } from "@/lib/scorer/voice";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Sheet } from "./ExtrasPicker";

interface Props {
  matchId: string;
  innings: 1 | 2;
  canEndInnings: boolean;
  busy: boolean;
  voice: VoiceSetting;
  onVoice: (v: VoiceSetting) => void;
  onEndInnings: () => Promise<boolean>;
  onClose: () => void;
}

const VOICES: { value: VoiceSetting; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी" },
  { value: "off", label: "Off" },
];

export function MoreMenu({ matchId, innings, canEndInnings, busy, voice, onVoice, onEndInnings, onClose }: Props) {
  const [confirming, setConfirming] = useState(false);

  return (
    <Sheet title="More" onClose={onClose}>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold text-ink-muted">Spoken confirmation</legend>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
          {VOICES.map((v) => (
            <button
              key={v.value}
              type="button"
              aria-pressed={voice === v.value}
              onClick={() => onVoice(v.value)}
              className="h-11 rounded-lg font-semibold text-ink-muted aria-pressed:bg-surface aria-pressed:text-ink"
            >
              {v.label}
            </button>
          ))}
        </div>
      </fieldset>

      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
        <h3 className="font-semibold">End innings {innings} now</h3>
        <p className="text-sm text-ink-muted">
          For rain, bad light, or when both captains agree. {innings === 1 ? "The target is set from the current score." : "The result is decided on the current score."}{" "}
          This can't be undone.
        </p>
        {!confirming ? (
          <Button variant="secondary" disabled={!canEndInnings || busy} onClick={() => setConfirming(true)}>
            End innings
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              className="flex-[2]"
              disabled={busy}
              onClick={async () => {
                if (await onEndInnings()) onClose();
              }}
            >
              {busy ? "Ending…" : `Yes, end innings ${innings}`}
            </Button>
          </div>
        )}
        {!canEndInnings && <p className="text-xs text-ink-muted">Bowl at least one ball first.</p>}
      </section>

      <Link href={`/match/${matchId}`} target="_blank" className={buttonClasses("ghost", "md")}>
        Open the viewer page
      </Link>
    </Sheet>
  );
}
