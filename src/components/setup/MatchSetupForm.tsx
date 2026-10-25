"use client";

// New match, step by step:
//   1. Format and teams (saved team, or a quick team typed in now)
//   2. Today's players (pick from the saved squad, add guests)
//   3. Toss
//   4. Batting order, openers and opening bowler
// Then: the viewer link to share, and the secret scoring link.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, newId } from "@/lib/apiClient";
import type { CreateMatchResult, PlayerInput, Team } from "@/lib/db/types";
import { Button, buttonClasses } from "@/components/ui/Button";
import { BattingOrderPicker } from "./BattingOrderPicker";
import { PlayerList } from "./PlayerList";
import { TEAM_COLOURS, TeamFields, type TeamFieldsValue } from "./TeamForm";
import { TossStep, type TossValue } from "./TossStep";

const OVER_PRESETS = [6, 8, 10, 20];
const STEP_TITLES = ["Teams and format", "Today's players", "Toss", "Batting order"];

interface Guest {
  id: string;
  name: string;
  saveToTeam: boolean;
}

interface SideDraft {
  mode: "saved" | "quick";
  teamId: string | null;
  /** Saved players picked for today, in the order tapped. */
  selected: string[];
  guests: Guest[];
  quick: TeamFieldsValue & { save: boolean; players: PlayerInput[] };
}

interface LineupPlayer extends PlayerInput {
  isNew: boolean;
  saveToTeam: boolean;
}

function emptySide(colour: string): SideDraft {
  return {
    mode: "saved",
    teamId: null,
    selected: [],
    guests: [],
    quick: { name: "", shortCode: "", colour, save: true, players: [] },
  };
}

function sideInfo(side: SideDraft, teams: Team[]): { name: string; shortCode: string; colour: string } {
  if (side.mode === "quick") return { name: side.quick.name || "Quick team", shortCode: side.quick.shortCode, colour: side.quick.colour };
  const t = teams.find((x) => x.id === side.teamId);
  return t ? { name: t.name, shortCode: t.shortCode, colour: t.colour } : { name: "Pick a team", shortCode: "", colour: "#3E4A42" };
}

function lineupOf(side: SideDraft, teams: Team[]): LineupPlayer[] {
  if (side.mode === "quick") return side.quick.players.map((p) => ({ ...p, isNew: true, saveToTeam: false }));
  const team = teams.find((t) => t.id === side.teamId);
  const picked = side.selected
    .map((id) => team?.players.find((p) => p.id === id))
    .filter((p): p is PlayerInput => p !== undefined)
    .map((p) => ({ ...p, isNew: false, saveToTeam: false }));
  const guests = side.guests.map((g) => ({ id: g.id, name: g.name, isNew: true, saveToTeam: g.saveToTeam }));
  return [...picked, ...guests];
}

function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="rounded-xl bg-wicket/10 px-3 py-2 text-sm font-semibold text-wicket">
      {text}
    </p>
  );
}

// ---------- step 1: one side ----------

function SidePicker({
  label,
  side,
  teams,
  otherTeamId,
  onChange,
}: {
  label: string;
  side: SideDraft;
  teams: Team[];
  otherTeamId: string | null;
  onChange: (s: SideDraft) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <legend className="px-1 text-sm font-bold text-ink-muted">{label}</legend>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1" role="group" aria-label={`${label} source`}>
        {(["saved", "quick"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={side.mode === m}
            onClick={() => onChange({ ...side, mode: m })}
            className="h-10 rounded-lg text-sm font-semibold text-ink-muted aria-pressed:bg-surface aria-pressed:text-ink"
          >
            {m === "saved" ? "Saved team" : "Quick team"}
          </button>
        ))}
      </div>

      {side.mode === "saved" ? (
        teams.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No saved teams yet. Use a quick team, or{" "}
            <Link href="/teams" className="font-semibold text-pitch underline">
              create one
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            <label htmlFor={`${label}-team`} className="sr-only">
              {label}
            </label>
            <select
              id={`${label}-team`}
              value={side.teamId ?? ""}
              onChange={(e) => onChange({ ...side, teamId: e.target.value || null, selected: [], guests: [] })}
              className="h-12 rounded-xl border border-line bg-surface px-3 text-base text-ink"
            >
              <option value="">Choose a saved team</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id} disabled={t.id === otherTeamId}>
                  {t.name} ({t.players.length} players)
                </option>
              ))}
            </select>
          </div>
        )
      ) : (
        <>
          <TeamFields
            value={side.quick}
            onChange={(v) => onChange({ ...side, quick: { ...side.quick, ...v } })}
            idPrefix={`${label}-quick`}
          />
          <label className="flex min-h-11 items-center gap-3 text-[15px]">
            <input
              type="checkbox"
              checked={side.quick.save}
              onChange={(e) => onChange({ ...side, quick: { ...side.quick, save: e.target.checked } })}
              className="size-5 accent-pitch"
            />
            Save this team for next time
          </label>
        </>
      )}
    </fieldset>
  );
}

// ---------- step 2: today's players for one side ----------

function SquadPicker({
  side,
  team,
  info,
  playersPerSide,
  onChange,
}: {
  side: SideDraft;
  team: Team | undefined;
  info: { name: string; colour: string };
  playersPerSide: number;
  onChange: (s: SideDraft) => void;
}) {
  const [guestName, setGuestName] = useState("");
  const count = side.mode === "quick" ? side.quick.players.length : side.selected.length + side.guests.length;
  const full = count >= playersPerSide;

  const heading = (
    <h3 className="flex items-center justify-between text-sm font-bold">
      <span className="flex items-center gap-2">
        <span className="size-3 rounded" style={{ background: info.colour }} aria-hidden="true" />
        {info.name}
      </span>
      <span className={count === playersPerSide ? "text-pitch" : "text-ink-muted"}>
        {count} / {playersPerSide}
      </span>
    </h3>
  );

  if (side.mode === "quick") {
    return (
      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        {heading}
        <PlayerList
          players={side.quick.players}
          max={playersPerSide}
          onChange={(players) => onChange({ ...side, quick: { ...side.quick, players } })}
        />
      </section>
    );
  }

  const toggle = (id: string) => {
    const on = side.selected.includes(id);
    if (!on && full) return;
    onChange({ ...side, selected: on ? side.selected.filter((x) => x !== id) : [...side.selected, id] });
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      {heading}
      <ul className="flex flex-col gap-1">
        {team?.players.map((p) => {
          const on = side.selected.includes(p.id);
          return (
            <li key={p.id}>
              <label className={`flex min-h-11 items-center gap-3 rounded-lg px-2 ${!on && full ? "opacity-50" : ""}`}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!on && full}
                  onChange={() => toggle(p.id)}
                  className="size-5 accent-pitch"
                />
                <span className="flex-1">{p.name}</span>
                {p.role && <span className="text-xs text-ink-muted">{p.role}</span>}
              </label>
            </li>
          );
        })}
        {side.guests.map((g) => (
          <li key={g.id} className="flex min-h-11 items-center gap-3 rounded-lg bg-surface-2 px-2">
            <span className="flex-1">
              {g.name} <span className="text-xs text-ink-muted">guest</span>
            </span>
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              <input
                type="checkbox"
                checked={g.saveToTeam}
                onChange={(e) =>
                  onChange({ ...side, guests: side.guests.map((x) => (x.id === g.id ? { ...x, saveToTeam: e.target.checked } : x)) })
                }
                className="size-4 accent-pitch"
              />
              Save to team
            </label>
            <button
              type="button"
              aria-label={`Remove guest ${g.name}`}
              onClick={() => onChange({ ...side, guests: side.guests.filter((x) => x.id !== g.id) })}
              className="flex size-10 items-center justify-center rounded-lg text-ink-muted"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {!full && (
        <div className="flex gap-2">
          <label htmlFor={`guest-${side.teamId}`} className="sr-only">
            Guest player name
          </label>
          <input
            id={`guest-${side.teamId}`}
            value={guestName}
            maxLength={40}
            placeholder="Add a guest player"
            onChange={(e) => setGuestName(e.target.value)}
            className="h-11 min-w-0 flex-1 rounded-xl border border-dashed border-line bg-transparent px-3 text-[15px] placeholder:text-ink-muted"
          />
          <Button
            variant="secondary"
            disabled={!guestName.trim()}
            onClick={() => {
              onChange({ ...side, guests: [...side.guests, { id: newId(), name: guestName.trim(), saveToTeam: false }] });
              setGuestName("");
            }}
          >
            Add
          </Button>
        </div>
      )}
    </section>
  );
}

// ---------- the whole flow ----------

export function MatchSetupForm() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateMatchResult | null>(null);

  const [title, setTitle] = useState("");
  const [venue, setVenue] = useState("");
  const [overs, setOvers] = useState(20);
  const [customOvers, setCustomOvers] = useState(false);
  const [playersPerSide, setPlayersPerSide] = useState(11);
  const [lastManStands, setLastManStands] = useState(false);
  const [sides, setSides] = useState<[SideDraft, SideDraft]>([emptySide(TEAM_COLOURS[0]!), emptySide(TEAM_COLOURS[1]!)]);
  const [toss, setToss] = useState<TossValue>({});
  const [orders, setOrders] = useState<[string[], string[]]>([[], []]);
  const [bowler, setBowler] = useState("");

  useEffect(() => {
    api<{ teams: Team[] }>("/api/teams")
      .then((r) => setTeams(r.teams))
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  const infos = [sideInfo(sides[0], teams), sideInfo(sides[1], teams)] as const;
  const lineups = useMemo(() => [lineupOf(sides[0], teams), lineupOf(sides[1], teams)] as const, [sides, teams]);
  const battingIndex =
    toss.winner !== undefined && toss.decision ? (toss.decision === "bat" ? toss.winner : 1 - toss.winner) : 0;

  const setSide = (i: 0 | 1, s: SideDraft) => setSides((prev) => (i === 0 ? [s, prev[1]] : [prev[0], s]));

  /** Returns an error message, or null if the step is complete. */
  function checkStep(n: number): string | null {
    if (n === 0) {
      if (!title.trim()) return "Give the match a name.";
      if (!Number.isInteger(overs) || overs < 1 || overs > 50) return "Overs must be from 1 to 50.";
      for (const [i, s] of sides.entries()) {
        if (s.mode === "saved" && !s.teamId) return `Choose team ${i + 1}, or switch to a quick team.`;
        if (s.mode === "quick" && (!s.quick.name.trim() || !s.quick.shortCode.trim())) return `Give team ${i + 1} a name and code.`;
      }
      if (sides[0].mode === "saved" && sides[0].teamId === sides[1].teamId) return "Pick two different teams.";
    }
    if (n === 1) {
      for (const [i, l] of lineups.entries()) {
        if (l.length !== playersPerSide) return `${infos[i]!.name} needs exactly ${playersPerSide} players (has ${l.length}).`;
        if (l.some((p) => !p.name.trim())) return `Every player in ${infos[i]!.name} needs a name.`;
      }
    }
    if (n === 2 && (toss.winner === undefined || !toss.decision)) return "Pick who won the toss and what they chose.";
    if (n === 3 && !bowler) return "Pick the opening bowler.";
    return null;
  }

  function next() {
    const problem = checkStep(step);
    setError(problem);
    if (problem) return;
    if (step === 2) {
      // Start each batting order from today's lineup, keeping any order already set.
      setOrders((prev) => {
        const fresh = (i: 0 | 1) => {
          const ids = lineups[i].map((p) => p.id);
          const kept = prev[i].filter((id) => ids.includes(id));
          return [...kept, ...ids.filter((id) => !kept.includes(id))];
        };
        return [fresh(0), fresh(1)];
      });
      setBowler("");
    }
    setStep((s) => s + 1);
  }

  async function submit() {
    const problem = checkStep(3);
    setError(problem);
    if (problem) return;
    setSubmitting(true);
    try {
      const body = {
        title: title.trim(),
        venue: venue.trim() || undefined,
        overs,
        playersPerSide,
        lastManStands,
        sides: sides.map((s, i) => {
          const byId = new Map(lineups[i]!.map((p) => [p.id, p]));
          const players = orders[i as 0 | 1].map((id) => {
            const p = byId.get(id)!;
            return { id: p.id, name: p.name.trim(), role: p.role, isNew: p.isNew, saveToTeam: p.saveToTeam };
          });
          return s.mode === "saved"
            ? { teamId: s.teamId, players }
            : {
                newTeam: { name: s.quick.name.trim(), shortCode: s.quick.shortCode.trim(), colour: s.quick.colour, save: s.quick.save },
                players,
              };
        }),
        toss,
        openers: { striker: orders[battingIndex as 0 | 1][0], nonStriker: orders[battingIndex as 0 | 1][1], bowler },
      };
      setResult(await api<CreateMatchResult>("/api/matches", { method: "POST", body }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the match.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) return <MatchCreated result={result} title={title} />;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 px-4 pt-4 pb-2">
        <Link href="/" aria-label="Cancel setup" className={buttonClasses("secondary", "md", "w-11 px-0")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold">New match</h1>
          <p className="text-sm text-ink-muted">
            Step {step + 1} of 4 · {STEP_TITLES[step]}
          </p>
        </div>
      </header>
      <div className="grid grid-cols-4 gap-1.5 px-4 pb-4" aria-hidden="true">
        {STEP_TITLES.map((_, i) => (
          <span key={i} className={`h-1 rounded-full ${i <= step ? "bg-pitch" : "bg-line"}`} />
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-4 px-4 pb-4">
        <ErrorNote text={loadError} />

        {step === 0 && (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="title" className="text-sm font-bold text-ink-muted">
                Match name
              </label>
              <input
                id="title"
                value={title}
                maxLength={80}
                placeholder="e.g. Sunday League Final"
                onChange={(e) => setTitle(e.target.value)}
                className="h-12 rounded-xl border border-line bg-surface px-3 text-base"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="venue" className="text-sm font-bold text-ink-muted">
                Venue (optional)
              </label>
              <input
                id="venue"
                value={venue}
                maxLength={80}
                onChange={(e) => setVenue(e.target.value)}
                className="h-12 rounded-xl border border-line bg-surface px-3 text-base"
              />
            </div>

            <SidePicker label="Team 1" side={sides[0]} teams={teams} otherTeamId={sides[1].teamId} onChange={(s) => setSide(0, s)} />
            <p className="text-center font-score text-lg font-bold text-ink-muted">VS</p>
            <SidePicker label="Team 2" side={sides[1]} teams={teams} otherTeamId={sides[0].teamId} onChange={(s) => setSide(1, s)} />

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-bold text-ink-muted">Overs per innings</legend>
              <div className="grid grid-cols-5 gap-2">
                {OVER_PRESETS.map((o) => (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={!customOvers && overs === o}
                    onClick={() => {
                      setCustomOvers(false);
                      setOvers(o);
                    }}
                    className="h-12 rounded-xl border border-line bg-surface font-score text-xl font-bold aria-pressed:border-2 aria-pressed:border-pitch aria-pressed:bg-pitch-soft"
                  >
                    {o}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={customOvers}
                  onClick={() => setCustomOvers(true)}
                  className="h-12 rounded-xl border border-line bg-surface text-sm font-semibold aria-pressed:border-2 aria-pressed:border-pitch aria-pressed:bg-pitch-soft"
                >
                  Custom
                </button>
              </div>
              {customOvers && (
                <label className="flex items-center gap-3">
                  <span className="text-sm text-ink-muted">Overs</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={50}
                    value={overs}
                    onChange={(e) => setOvers(Number(e.target.value))}
                    className="h-12 w-24 rounded-xl border border-line bg-surface px-3 text-base"
                  />
                </label>
              )}
            </fieldset>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
                <span className="text-sm font-bold text-ink-muted">Players per side</span>
                <div className="flex items-center justify-between">
                  <Button variant="secondary" aria-label="Fewer players" className="w-11 px-0" disabled={playersPerSide <= 2} onClick={() => setPlayersPerSide((n) => n - 1)}>
                    −
                  </Button>
                  <span className="font-score text-2xl font-bold">{playersPerSide}</span>
                  <Button variant="secondary" aria-label="More players" className="w-11 px-0" disabled={playersPerSide >= 15} onClick={() => setPlayersPerSide((n) => n + 1)}>
                    +
                  </Button>
                </div>
              </div>
              <label className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
                <span className="text-sm font-bold text-ink-muted">Last man stands</span>
                <span className="flex min-h-11 items-center justify-between">
                  <span className="text-sm text-ink-muted">{lastManStands ? "On" : "Off"}</span>
                  <input type="checkbox" checked={lastManStands} onChange={(e) => setLastManStands(e.target.checked)} className="size-6 accent-pitch" />
                </span>
              </label>
            </div>
          </>
        )}

        {step === 1 &&
          ([0, 1] as const).map((i) => (
            <SquadPicker
              key={i}
              side={sides[i]}
              team={teams.find((t) => t.id === sides[i].teamId)}
              info={infos[i]}
              playersPerSide={playersPerSide}
              onChange={(s) => setSide(i, s)}
            />
          ))}

        {step === 2 && <TossStep teams={[infos[0], infos[1]]} value={toss} onChange={setToss} />}

        {step === 3 &&
          (() => {
            const bat = battingIndex as 0 | 1;
            const bowl = (1 - battingIndex) as 0 | 1;
            const setOrder = (i: 0 | 1) => (o: string[]) => setOrders((prev) => (i === 0 ? [o, prev[1]] : [prev[0], o]));
            return (
              <>
                <BattingOrderPicker
                  title={`${infos[bat].name} · batting first`}
                  colour={infos[bat].colour}
                  players={lineups[bat]}
                  order={orders[bat]}
                  onChange={setOrder(bat)}
                  showOpeners
                />
                <div className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4">
                  <label htmlFor="bowler" className="text-sm font-bold text-ink-muted">
                    Opening bowler ({infos[bowl].name})
                  </label>
                  <select
                    id="bowler"
                    value={bowler}
                    onChange={(e) => {
                      setBowler(e.target.value);
                      setError(null);
                    }}
                    className="h-12 rounded-xl border border-line bg-surface px-3 text-base"
                  >
                    <option value="">Choose the bowler</option>
                    {lineups[bowl].map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <BattingOrderPicker
                  title={`${infos[bowl].name} · batting second`}
                  colour={infos[bowl].colour}
                  players={lineups[bowl]}
                  order={orders[bowl]}
                  onChange={setOrder(bowl)}
                  showOpeners={false}
                />
              </>
            );
          })()}

        <ErrorNote text={error} />
      </div>

      <footer className="sticky bottom-0 flex gap-2 border-t border-line bg-ground px-4 pt-3 pb-6">
        {step > 0 && (
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => { setError(null); setStep((s) => s - 1); }}>
            Back
          </Button>
        )}
        {step < 3 ? (
          <Button size="lg" className="flex-[2]" onClick={next}>
            Continue
          </Button>
        ) : (
          <Button size="lg" className="flex-[2]" onClick={submit} disabled={submitting}>
            {submitting ? "Creating…" : "Create match"}
          </Button>
        )}
      </footer>
    </div>
  );
}

// ---------- after creating ----------

function CopyRow({ label, url, note }: { label: string; url: string; note: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
      <span className="text-sm font-bold text-ink-muted">{label}</span>
      <code className="break-all rounded-lg bg-surface-2 px-3 py-2 text-sm">{url}</code>
      <p className="text-sm text-ink-muted">{note}</p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              window.prompt("Copy this link:", url);
            }
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noreferrer"
          className={buttonClasses("secondary", "md", "flex-1")}
        >
          Share on WhatsApp
        </a>
      </div>
    </div>
  );
}

function MatchCreated({ result, title }: { result: CreateMatchResult; title: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 py-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-bold text-pitch">Match created</p>
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>
      <CopyRow label="Viewer link" url={result.viewerUrl} note="Share with everyone. They can follow the live score and ask questions." />
      <CopyRow
        label="Scoring link (keep it private)"
        url={result.scoringUrl}
        note="Anyone with this link can score the match. Save it now: it is shown only once."
      />
      <div className="mt-auto flex flex-col gap-2">
        <Link href="/" className={buttonClasses("secondary", "lg")}>
          Back to home
        </Link>
      </div>
    </main>
  );
}
