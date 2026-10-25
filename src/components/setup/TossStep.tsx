"use client";

// Toss: which team won, and did they choose to bat or bowl.

export interface TossValue {
  winner?: 0 | 1;
  decision?: "bat" | "bowl";
}

interface Props {
  teams: [{ name: string; colour: string }, { name: string; colour: string }];
  value: TossValue;
  onChange: (v: TossValue) => void;
}

const choiceClass =
  "flex min-h-14 items-center gap-3 rounded-2xl border bg-surface px-4 text-left font-semibold transition " +
  "border-line aria-pressed:border-2 aria-pressed:border-pitch aria-pressed:bg-pitch-soft";

export function TossStep({ teams, value, onChange }: Props) {
  const battingTeam =
    value.winner !== undefined && value.decision
      ? teams[value.decision === "bat" ? value.winner : ((1 - value.winner) as 0 | 1)]!.name
      : null;

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold text-ink-muted">Who won the toss?</legend>
        {teams.map((t, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={value.winner === i}
            onClick={() => onChange({ ...value, winner: i as 0 | 1 })}
            className={choiceClass}
          >
            <span className="size-4 rounded" style={{ background: t.colour }} aria-hidden="true" />
            {t.name}
          </button>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold text-ink-muted">They chose to</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["bat", "bowl"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={value.decision === d}
              onClick={() => onChange({ ...value, decision: d })}
              className={`${choiceClass} justify-center`}
            >
              {d === "bat" ? "Bat first" : "Bowl first"}
            </button>
          ))}
        </div>
      </fieldset>

      {battingTeam && (
        <p className="rounded-xl bg-surface-2 px-4 py-3 font-semibold">
          {battingTeam} will bat first.
        </p>
      )}
    </div>
  );
}
