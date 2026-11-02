import clsx from "clsx";
import {
  Award,
  CalendarCheck,
  ChefHat,
  Flame,
  FolderTree,
  Leaf,
  LifeBuoy,
  Lock,
  NotebookPen,
  PackagePlus,
  ScanBarcode,
  ShieldCheck,
  ShoppingCart,
  Trophy,
  Utensils,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Badge } from "../lib/gamification";

export const BADGE_ICONS: Record<string, LucideIcon> = {
  "package-plus": PackagePlus,
  utensils: Utensils,
  "life-buoy": LifeBuoy,
  "chef-hat": ChefHat,
  "notebook-pen": NotebookPen,
  "folder-tree": FolderTree,
  flame: Flame,
  warehouse: Warehouse,
  "shopping-cart": ShoppingCart,
  "scan-barcode": ScanBarcode,
  "calendar-check": CalendarCheck,
  "shield-check": ShieldCheck,
  award: Award,
  leaf: Leaf,
};

const prefersReduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Counts up to a number when it first appears (and animates changes after). */
export function CountUp({ value, duration = 900, format = (n: number) => String(Math.round(n)) }: { value: number; duration?: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(prefersReduced() ? value : 0);
  const from = useRef(shown);
  useEffect(() => {
    if (prefersReduced()) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = a + (value - a) * eased;
      setShown(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className="num">{format(shown)}</span>;
}

/** Cards lean towards the pointer in 3D. Off for keyboard users' focus styles and reduced motion. */
export function Tilt({ children, className, max = 7, style }: { children: ReactNode; className?: string; max?: number; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.PointerEvent) => {
    if (prefersReduced() || e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    ref.current.style.transform = `perspective(700px) rotateX(${-y * max}deg) rotateY(${x * max}deg) translateZ(4px)`;
  };
  const reset = () => {
    if (ref.current) ref.current.style.transform = "";
  };
  return (
    <div ref={ref} onPointerMove={onMove} onPointerLeave={reset} className={clsx("transition-transform duration-200 ease-out will-change-transform", className)} style={style}>
      {children}
    </div>
  );
}

/** Animated progress ring with the level number in the middle. */
export function LevelRing({ level, progress, size = 120, stroke = 10 }: { level: number; progress: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [p, setP] = useState(prefersReduced() ? progress : 0);
  useEffect(() => {
    const t = setTimeout(() => setP(progress), 60);
    return () => clearTimeout(t);
  }, [progress]);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#lvl-grad)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * p) / 100}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)" }}
        />
        <defs>
          <linearGradient id="lvl-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--basil)" />
            <stop offset="100%" stopColor="var(--turmeric-bar)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[11px] font-semibold text-ink-2">Level</span>
        <span className="font-display leading-none font-[750] text-ink" style={{ fontSize: size * 0.3 }}>
          {level}
        </span>
      </div>
    </div>
  );
}

/** A flame that flickers while the streak is alive and goes grey when it isn't. */
export function StreakFlame({ days, alive, size = 40 }: { days: number; alive: boolean; size?: number }) {
  return (
    <span className={clsx("relative inline-block shrink-0", alive && days > 0 ? "flame-alive" : "grayscale opacity-60")} style={{ width: size, height: size * 1.2 }} aria-hidden>
      <svg viewBox="0 0 40 48" width={size} height={size * 1.2} className="block">
        <path className="flame-outer" d="M20 2c4 9 14 14 14 27a14 14 0 0 1-28 0c0-7 4-11 7-15 0 5 2 8 5 8-3-7 0-14 2-20z" fill="var(--turmeric-bar)" />
        <path className="flame-inner" d="M20 20c2 5 8 8 8 15a8 8 0 0 1-16 0c0-4 2-6 4-8 0 3 1 4 3 4-1-4 0-8 1-11z" fill="var(--chilli)" />
      </svg>
    </span>
  );
}

const TIER: Record<Badge["tier"], string> = {
  bronze: "linear-gradient(135deg,#8a4b1f 0%,#d58c4f 45%,#f3c18f 55%,#a8612c 100%)",
  silver: "linear-gradient(135deg,#6c7680 0%,#c9d1d9 45%,#f4f7fa 55%,#8b96a1 100%)",
  gold: "linear-gradient(135deg,#9a6a06 0%,#e5b52f 45%,#fbe58a 55%,#b9830f 100%)",
};

/** A 3D medal. Earned medals shine and turn on hover; locked ones are grey with a padlock. */
export function Medal({ badge, size = 76, spin = false }: { badge: Pick<Badge, "icon" | "tier" | "earned" | "title">; size?: number; spin?: boolean }) {
  const Icon = BADGE_ICONS[badge.icon] ?? Trophy;
  return (
    <div className="medal-stage" style={{ width: size, height: size }}>
      <div className={clsx("medal", spin && "medal-spin", !badge.earned && "medal-locked")} style={{ width: size, height: size }}>
        <div className="medal-face" style={{ background: badge.earned ? TIER[badge.tier] : "linear-gradient(135deg,#9aa0a6,#d5d8db)" }}>
          <div className="medal-inner">{badge.earned ? <Icon style={{ width: size * 0.42, height: size * 0.42 }} aria-hidden /> : <Lock style={{ width: size * 0.34, height: size * 0.34 }} aria-hidden />}</div>
          {badge.earned && <span className="medal-shine" />}
        </div>
        <div className="medal-face medal-back" style={{ background: badge.earned ? TIER[badge.tier] : "linear-gradient(135deg,#9aa0a6,#d5d8db)" }}>
          <div className="medal-inner">
            <Trophy style={{ width: size * 0.36, height: size * 0.36 }} aria-hidden />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Badge card that flips to show how to earn it (click, Enter or hover). */
export function BadgeCard({ badge }: { badge: Badge }) {
  const [flipped, setFlipped] = useState(false);
  const pct = Math.round((badge.progress.current / badge.progress.target) * 100);
  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      className={clsx("flip-card group h-48 w-full text-left", flipped && "is-flipped")}
      aria-pressed={flipped}
      aria-label={`${badge.title}: ${badge.earned ? "earned" : `${badge.progress.current} of ${badge.progress.target}`}. ${badge.description}`}
    >
      <div className="flip-inner">
        <div className={clsx("flip-face flex flex-col items-center justify-center gap-2 rounded-2xl border p-3 text-center", badge.earned ? "border-turmeric/30 bg-surface" : "border-dashed border-line-strong bg-surface-2")}>
          <Medal badge={badge} size={72} />
          <p className={clsx("font-semibold", !badge.earned && "text-ink-2")}>{badge.title}</p>
          {badge.earned ? (
            <p className="text-xs capitalize text-turmeric">{badge.tier} badge</p>
          ) : (
            <div className="w-full px-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-basil transition-[width] duration-700" style={{ width: `${pct}%` }} />
              </div>
              <p className="num mt-1 text-xs text-ink-3">
                {badge.progress.current} / {badge.progress.target}
              </p>
            </div>
          )}
        </div>
        <div className="flip-face flip-back flex flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-bay p-4 text-center text-oat">
          <p className="font-display text-lg font-[650]">{badge.title}</p>
          <p className="text-sm opacity-90">{badge.description}</p>
          {badge.earnedAt && <p className="text-xs opacity-75">Earned {new Date(badge.earnedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>}
        </div>
      </div>
    </button>
  );
}
