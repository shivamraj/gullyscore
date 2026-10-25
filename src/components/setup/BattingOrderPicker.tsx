"use client";

// Batting order: move players up and down. The first two are the openers (1 on strike, 2 non-striker).
// Up/down buttons instead of drag-and-drop: easier with a thumb and works with screen readers.

interface Props {
  title: string;
  colour: string;
  players: { id: string; name: string }[];
  /** Player ids in batting order. */
  order: string[];
  onChange: (order: string[]) => void;
  /** Mark the first two as the opening pair. */
  showOpeners: boolean;
}

function move(order: string[], from: number, to: number): string[] {
  if (to < 0 || to >= order.length) return order;
  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

function Arrow({ up }: { up: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
    </svg>
  );
}

export function BattingOrderPicker({ title, colour, players, order, onChange, showOpeners }: Props) {
  const nameOf = new Map(players.map((p) => [p.id, p.name]));

  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-bold text-ink-muted">
        <span className="size-3 rounded" style={{ background: colour }} aria-hidden="true" />
        {title}
      </h3>
      <ol className="flex flex-col gap-1.5">
        {order.map((id, i) => {
          const name = nameOf.get(id) ?? "Unknown";
          const opener = showOpeners && i < 2;
          return (
            <li
              key={id}
              className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 ${
                opener ? "border-pitch bg-pitch-soft" : "border-line bg-surface"
              }`}
            >
              <span className="w-6 font-score text-lg font-bold text-ink-muted">{i + 1}</span>
              <span className="flex-1 font-semibold">{name}</span>
              {opener && <span className="text-xs font-bold text-pitch">{i === 0 ? "ON STRIKE" : "NON-STRIKER"}</span>}
              <button
                type="button"
                aria-label={`Move ${name} up`}
                disabled={i === 0}
                onClick={() => onChange(move(order, i, i - 1))}
                className="flex size-10 items-center justify-center rounded-lg text-ink hover:bg-surface-2 disabled:opacity-25"
              >
                <Arrow up />
              </button>
              <button
                type="button"
                aria-label={`Move ${name} down`}
                disabled={i === order.length - 1}
                onClick={() => onChange(move(order, i, i + 1))}
                className="flex size-10 items-center justify-center rounded-lg text-ink hover:bg-surface-2 disabled:opacity-25"
              >
                <Arrow up={false} />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
