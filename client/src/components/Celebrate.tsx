import { useQueryClient } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { post } from "../lib/api";
import { useGamification, type Badge } from "../lib/gamification";
import { LevelRing, Medal } from "./game";

// No background worker: the security policy only allows scripts from this site, not generated blob: workers
let fire: ReturnType<typeof confetti.create> | null = null;
const confettiFire = (opts: confetti.Options) => {
  fire ??= confetti.create(undefined, { resize: true, useWorker: false, disableForReducedMotion: true });
  return fire(opts);
};

function burst() {
  const colors = ["#2f7d4f", "#d99a1e", "#eb6834", "#55b07a", "#fbe58a"];
  confettiFire({ particleCount: 90, spread: 75, origin: { y: 0.35 }, colors, disableForReducedMotion: true, zIndex: 60 });
  setTimeout(() => confettiFire({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.6 }, colors, disableForReducedMotion: true, zIndex: 60 }), 180);
  setTimeout(() => confettiFire({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.6 }, colors, disableForReducedMotion: true, zIndex: 60 }), 320);
}

type Moment = { kind: "level"; level: number; name: string } | { kind: "badges"; badges: Badge[] };

/**
 * Header chip showing the level, plus the celebrations: "+N pts" pops when points are earned,
 * and a confetti moment for a level-up or newly earned badges (each celebrated once).
 */
export function LevelChip() {
  const q = useGamification();
  const qc = useQueryClient();
  const prev = useRef<{ xp: number; level: number } | null>(null);
  const [pops, setPops] = useState<{ id: number; text: string }[]>([]);
  const [moment, setMoment] = useState<Moment | null>(null);

  useEffect(() => {
    const g = q.data;
    if (!g) return;
    const before = prev.current;
    prev.current = { xp: g.xp, level: g.level.number };
    if (before && g.xp > before.xp) {
      const id = Date.now();
      setPops((p) => [...p, { id, text: `+${g.xp - before.xp} pts` }]);
      setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1700);
    }
    if (moment) return;
    if (before && g.level.number > before.level) {
      setMoment({ kind: "level", level: g.level.number, name: g.level.name });
      burst();
    } else if (g.newBadges.length) {
      setMoment({ kind: "badges", badges: g.badges.filter((b) => g.newBadges.includes(b.key)).slice(0, 3) });
      burst();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const close = async () => {
    const g = q.data;
    setMoment(null);
    if (g?.newBadges.length) {
      await post("/gamification/seen", { keys: g.newBadges }).catch(() => undefined);
      qc.invalidateQueries({ queryKey: ["gamification"] });
    }
  };

  // Dismisses itself after a few seconds (marking badges as seen)
  useEffect(() => {
    if (!moment) return;
    const t = setTimeout(() => void close(), 7000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment]);

  const title = moment?.kind === "level" ? "Level up!" : moment && moment.badges.length > 1 ? "Badges unlocked!" : "Badge unlocked!";
  const g = q.data;
  return (
    <>
      <Link
        to="/rewards"
        className="relative inline-flex h-9 items-center gap-2 rounded-full border border-line bg-surface pr-3 pl-1 text-sm font-semibold hover:border-line-strong"
        aria-label={g ? `Level ${g.level.number}, ${g.xp} points. Open rewards` : "Rewards"}
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-basil to-turmeric-bar font-display text-xs font-[750] text-white">{g?.level.number ?? "–"}</span>
        <span className="num hidden sm:inline">{g ? `${g.xp} pts` : "…"}</span>
        <span className="pointer-events-none absolute top-full right-0 mt-1 flex flex-col items-end gap-1" aria-live="polite">
          {pops.map((p) => (
            <span key={p.id} className="xp-pop rounded-full bg-basil px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-white shadow">
              {p.text}
            </span>
          ))}
        </span>
      </Link>

      {moment &&
        // A card in the corner, not a modal: it celebrates without interrupting whatever the user is doing.
        // Portalled to <body>: the header's backdrop blur would otherwise trap "position: fixed".
        createPortal(
        <div
          role="status"
          aria-live="polite"
          aria-label={title}
          className="sheet-in fixed right-4 bottom-4 z-50 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-turmeric/40 bg-surface shadow-2xl"
        >
          <div className="flex items-start gap-4 p-4">
            {moment.kind === "level" ? (
              <div className="medal-spin shrink-0">
                <LevelRing level={moment.level} progress={100} size={76} stroke={8} />
              </div>
            ) : (
              <div className="flex shrink-0 -space-x-6">
                {moment.badges.map((b) => (
                  <Medal key={b.key} badge={b} size={64} spin />
                ))}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-[700]">{title}</p>
              {moment.kind === "level" ? (
                <p className="text-sm text-ink-2">
                  You're now <span className="font-semibold text-ink">{moment.name}</span>.
                </p>
              ) : (
                <ul className="text-sm text-ink-2">
                  {moment.badges.map((b) => (
                    <li key={b.key}>
                      <span className="font-semibold text-ink">{b.title}</span> · {b.description}
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/rewards" onClick={() => void close()} className="mt-2 inline-block text-sm font-semibold text-basil hover:underline">
                See all rewards
              </Link>
            </div>
            <button type="button" onClick={() => void close()} aria-label="Dismiss" className="-mt-1 -mr-1 rounded-lg p-1 text-ink-3 hover:bg-oat hover:text-ink">
              ×
            </button>
          </div>
          <div className="celebrate-timer h-1 bg-gradient-to-r from-basil to-turmeric-bar" />
        </div>,
        document.body,
      )}
    </>
  );
}
