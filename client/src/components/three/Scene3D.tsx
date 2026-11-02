import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import type { Jar3D } from "./PantryScene";

// three.js is ~600 KB, so the scene is loaded only on pages that show it
const PantryScene = lazy(() => import("./PantryScene"));

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** If WebGL crashes (old GPU, driver issue), show the flat picture instead of a broken area. */
class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Flat version of the shelf: same data, no WebGL needed. */
export function FlatShelf({ jars, onSelect }: { jars: Jar3D[]; onSelect?: (id: string) => void }) {
  return (
    <div className="flex h-full items-end justify-center gap-3 px-4 pb-6">
      {jars.map((j) => (
        <button
          key={j.id}
          type="button"
          onClick={() => onSelect?.(j.id)}
          disabled={!onSelect}
          className="group flex w-20 flex-col items-center gap-1 disabled:cursor-default"
          aria-label={`${j.label}${j.sublabel ? `, ${j.sublabel}` : ""}`}
        >
          <div className="h-3 w-14 rounded-sm bg-bay" />
          <div className="relative h-20 w-14 overflow-hidden rounded-b-xl rounded-t-md border-2 border-line-strong bg-surface/60 transition-transform group-hover:-translate-y-1">
            <div className="absolute inset-x-1 bottom-1 rounded-b-lg" style={{ height: `${Math.max(8, j.fill * 100)}%`, background: j.color, opacity: 0.85 }} />
          </div>
          <span className="w-20 truncate text-center text-xs font-semibold text-ink">{j.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Scene3D({ jars, variant = "shelf", onSelect, className = "", fallback }: { jars: Jar3D[]; variant?: "shelf" | "hero"; onSelect?: (id: string) => void; className?: string; fallback?: ReactNode }) {
  const reduced = useReducedMotion();
  const [webgl] = useState(hasWebGL);
  const flat = fallback ?? <FlatShelf jars={jars} onSelect={onSelect} />;
  if (!webgl) return <div className={className}>{flat}</div>;
  return (
    <div className={className}>
      <SceneBoundary fallback={flat}>
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <div className="size-10 animate-spin rounded-full border-4 border-basil-soft border-t-basil" role="status" aria-label="Loading 3D shelf" />
            </div>
          }
        >
          <PantryScene jars={jars} variant={variant} onSelect={onSelect} reducedMotion={reduced} />
        </Suspense>
      </SceneBoundary>
    </div>
  );
}

export type { Jar3D };
