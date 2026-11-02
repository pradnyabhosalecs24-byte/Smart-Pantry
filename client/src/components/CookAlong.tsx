import clsx from "clsx";
import { ChevronLeft, ChevronRight, Clock, Pause, Play, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CookAction } from "../lib/types";
import { ACTION_LABEL, CookScene } from "./CookScene";
import { Button, IconButton } from "./ui";

export interface CookStep {
  text: string;
  action: CookAction;
  minutes?: number;
  /** ingredient amounts used in this step, already formatted ("300 g Potatoes") */
  uses?: string[];
}

const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** Short beep when a kitchen timer ends (no audio file needed). */
function beep() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.18, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.26);
    });
  } catch {
    /* audio not available — the on-screen message still shows */
  }
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * Animated, narrated step-by-step guide. "Play" works like a video: each step is animated,
 * read aloud, then the player moves on by itself. Real cooking times use the step timer.
 */
export function CookAlong({ title, steps, onClose, onFinish }: { title: string; steps: CookStep[]; onClose: () => void; onFinish?: () => void }) {
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [voice, setVoice] = useState(canSpeak());
  const [timer, setTimer] = useState<{ left: number; running: boolean; finished: boolean } | null>(null);
  const advanceRef = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const step = steps[idx];

  const stopSpeech = () => canSpeak() && window.speechSynthesis.cancel();
  const clearAdvance = () => {
    if (advanceRef.current) window.clearTimeout(advanceRef.current);
    advanceRef.current = null;
  };

  const go = useCallback(
    (n: number) => {
      clearAdvance();
      stopSpeech();
      if (n >= steps.length) {
        setPlaying(false);
        setDone(true);
        return;
      }
      setDone(false);
      setIdx(Math.max(0, n));
      setTimer(null);
    },
    [steps.length],
  );

  // Narrate the current step; in play mode, move on when narration ends
  useEffect(() => {
    if (done) return;
    clearAdvance();
    const next = () => {
      if (playing) advanceRef.current = window.setTimeout(() => go(idx + 1), 1400);
    };
    if (voice && canSpeak()) {
      stopSpeech();
      const amounts = step.uses?.length ? ` You need ${step.uses.join(", ")}.` : "";
      const u = new SpeechSynthesisUtterance(`Step ${idx + 1}. ${step.text}${amounts}`);
      u.lang = "en-IN";
      u.rate = 0.95;
      u.onend = next;
      window.speechSynthesis.speak(u);
    } else if (playing) {
      // No narration: give a reading time based on the length of the step
      advanceRef.current = window.setTimeout(() => go(idx + 1), Math.min(12000, 3500 + step.text.length * 45));
    }
    return clearAdvance;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, playing, voice, done]);

  // Kitchen timer
  useEffect(() => {
    if (!timer?.running) return;
    const t = window.setInterval(() => {
      setTimer((cur) => {
        if (!cur || !cur.running) return cur;
        if (cur.left <= 1) {
          beep();
          return { left: 0, running: false, finished: true };
        }
        return { ...cur, left: cur.left - 1 };
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [timer?.running]);

  // Keyboard: ← → to move, space to play/pause, Esc to close; focus stays inside the dialog
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(idx + 1);
      else if (e.key === "ArrowLeft") go(idx - 1);
      else if (e.key === " " && (e.target as HTMLElement).tagName !== "BUTTON") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prevFocus?.focus?.();
    };
  }, [idx, go, onClose]);

  useEffect(() => () => { stopSpeech(); clearAdvance(); }, []);

  return createPortal(
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Cook along: ${title}`} className="fixed inset-0 z-50 flex flex-col bg-oat">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-2">Cook along</p>
          <h2 className="truncate text-xl font-[650]">{title}</h2>
        </div>
        {canSpeak() && (
          <IconButton icon={voice ? Volume2 : VolumeX} label={voice ? "Turn off narration" : "Turn on narration"} aria-pressed={voice} onClick={() => { stopSpeech(); setVoice((v) => !v); }} />
        )}
        <IconButton icon={X} label="Close cook-along" onClick={onClose} />
      </header>

      {/* Progress */}
      <div className="flex gap-1 px-4 pt-3 sm:px-6" aria-hidden>
        {steps.map((_, i) => (
          <div key={i} className={clsx("h-1.5 flex-1 rounded-full", i < idx || done ? "bg-basil" : i === idx ? "bg-turmeric-bar" : "bg-line")} />
        ))}
      </div>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 overflow-y-auto px-4 py-6 sm:px-6 lg:flex-row lg:items-center">
        {done ? (
          <div className="step-in mx-auto flex max-w-lg flex-col items-center text-center">
            <CookScene action="serve" label={false} className="h-56 w-full max-w-md" />
            <h3 className="mt-2 text-3xl font-[650]">Ready to serve</h3>
            <p className="mt-2 text-ink-2">Enjoy your {title}. Record what you used so your pantry stays accurate.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {onFinish && (
                <Button onClick={onFinish} data-autofocus>
                  I cooked this, update pantry
                </Button>
              )}
              <Button variant="secondary" icon={RotateCcw} onClick={() => go(0)}>
                Start again
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div key={`scene-${idx}`} className="step-in overflow-hidden rounded-3xl border border-line bg-surface lg:w-[55%]">
              <CookScene action={step.action} className="aspect-[16/10] w-full" />
            </div>
            <div key={`text-${idx}`} className="step-in flex flex-1 flex-col" aria-live="polite">
              <p className="text-sm font-semibold text-basil">
                Step {idx + 1} of {steps.length} · {ACTION_LABEL[step.action]}
              </p>
              <p className="mt-2 font-display text-2xl leading-snug font-[600] sm:text-[28px]">{step.text}</p>
              {step.uses && step.uses.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2" aria-label="Ingredients for this step">
                  {step.uses.map((u) => (
                    <li key={u} className="num rounded-full bg-turmeric-soft px-3 py-1 text-sm font-semibold text-ink">
                      {u}
                    </li>
                  ))}
                </ul>
              )}
              {step.minutes ? (
                <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3">
                  <Clock className="size-5 text-ink-2" aria-hidden />
                  {timer ? (
                    <>
                      <span className={clsx("num font-display text-2xl font-[650]", timer.finished && "text-basil")} role="timer" aria-live="off">
                        {timer.finished ? "Time's up" : mmss(timer.left)}
                      </span>
                      {!timer.finished && (
                        <Button size="sm" variant="secondary" onClick={() => setTimer({ ...timer, running: !timer.running })}>
                          {timer.running ? "Pause timer" : "Resume"}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setTimer(null)}>
                        Reset
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-ink-2">About {step.minutes} min</span>
                      <Button size="sm" variant="subtle" onClick={() => setTimer({ left: step.minutes! * 60, running: true, finished: false })}>
                        Start {step.minutes}-minute timer
                      </Button>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </>
        )}
      </main>

      <footer className="flex items-center justify-between gap-2 border-t border-line bg-surface px-4 py-3 sm:px-6">
        <Button variant="secondary" icon={ChevronLeft} onClick={() => go(idx - 1)} disabled={idx === 0 && !done}>
          Back
        </Button>
        {!done && (
          <Button variant="subtle" icon={playing ? Pause : Play} onClick={() => setPlaying((p) => !p)} data-autofocus>
            {playing ? "Pause" : "Play all steps"}
          </Button>
        )}
        <Button onClick={() => go(idx + 1)} disabled={done}>
          {idx === steps.length - 1 ? "Finish" : "Next step"}
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </footer>
    </div>,
    document.body,
  );
}
