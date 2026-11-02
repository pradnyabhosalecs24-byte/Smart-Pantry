import { LanguageSelect, useLang } from "../components/LanguageSelect";
import { translate } from "../lib/i18n";
import { BellRing, CalendarDays, ChefHat, Mic, ScanBarcode, Sparkles, TrendingDown, Trophy } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { LevelRing, Medal, StreakFlame, Tilt } from "../components/game";
import { LogoMark } from "../components/Logo";
import { Scene3D, type Jar3D } from "../components/three/Scene3D";

const HERO_JARS: Jar3D[] = [
  { id: "1", label: "Milk", fill: 0.3, color: "#e0a326" },
  { id: "2", label: "Rice", fill: 0.92, color: "#3f9a63" },
  { id: "3", label: "Curd", fill: 0.15, color: "#c8402f" },
  { id: "4", label: "Dal", fill: 0.7, color: "#3f9a63" },
  { id: "5", label: "Ghee", fill: 0.55, color: "#2e6b4a" },
];

/** Adds .in-view to .reveal elements as they scroll into view (once). */
function useReveal() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const els = root.current?.querySelectorAll(".reveal") ?? [];
    if (!("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("in-view"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("in-view");
            io.unobserve(en.target);
          }
        }),
      { threshold: 0.15 },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return root;
}

const STEPS = [
  { icon: Mic, title: "Add in seconds", text: "Say “2 kg potatoes expiring Friday”, scan a barcode, or import a spreadsheet. Every purchase keeps its own expiry date." },
  { icon: BellRing, title: "Get nudged in time", text: "See what to use first, get alerts before food expires, and recipes that use exactly what's about to go off." },
  { icon: Trophy, title: "Level up by wasting less", text: "Earn points for every item you rescue, keep your kitchen streak alive, unlock badges and finish weekly challenges." },
];

const FEATURES = [
  { icon: CalendarDays, title: "Expiry calendar", text: "A month view of what reaches its date and when." },
  { icon: ChefHat, title: "Animated cook-along", text: "Step-by-step recipes with timers, read aloud." },
  { icon: TrendingDown, title: "Waste analytics", text: "Monthly trends, top wasted items and real cost." },
  { icon: ScanBarcode, title: "Barcode & photos", text: "Scan packets or snap a photo of each item." },
];

export function WelcomePage() {
  const root = useReveal();
  useEffect(() => {
    document.title = "Smart Pantry — waste less food";
  }, []);
  const lang = useLang();
  const headline = ["Use", "food", "before", "it's", "too", "late."];

  return (
    <div ref={root} className="min-h-screen overflow-x-hidden bg-oat">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-9" />
          <span className="font-display text-xl font-[750]">Smart Pantry</span>
        </div>
        <nav className="flex items-center gap-2">
          <LanguageSelect className="hidden sm:inline-flex" />
          <Link to="/login" className="rounded-lg px-3 py-2 font-semibold text-ink-2 hover:bg-surface hover:text-ink">
            Sign in
          </Link>
          <Link to="/register" className="rounded-lg bg-basil px-4 py-2 font-semibold text-white hover:bg-basil-hover">
            Get started
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-4 px-4 pt-6 pb-10 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:pt-10">
        <div>
          <p className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-basil-soft px-3 py-1 text-sm font-semibold text-bay">
            <Sparkles className="size-4" aria-hidden /> Smart food inventory & waste reduction
          </p>
          <h1 className="font-display text-[44px] leading-[1.02] font-[750] tracking-tight sm:text-[60px]" style={{ perspective: 600 }} translate="no" key={lang}>
            {translate(headline.join(" ")).trim().split(" ").map((w, i) => (
              <span key={i} className="hero-word mr-[0.22em]" style={{ animationDelay: `${120 + i * 90}ms` }}>
                {w}
              </span>
            ))}
          </h1>
          <p className="reveal mt-5 max-w-[48ch] text-lg text-ink-2">
            Smart Pantry tracks every jar and packet, tells you what to cook first, and turns cutting food waste into a game you'll actually keep playing.
          </p>
          <div className="reveal mt-7 flex flex-wrap gap-3">
            <Link to="/register" className="rounded-xl bg-basil px-6 py-3 text-lg font-semibold text-white shadow-[0_6px_0_var(--bay)] transition-transform hover:translate-y-[2px] hover:shadow-[0_4px_0_var(--bay)] active:translate-y-[6px] active:shadow-none">
              Create your pantry
            </Link>
            <Link to="/login" className="rounded-xl border border-line-strong bg-surface px-6 py-3 text-lg font-semibold hover:bg-surface-2">
              Sign in
            </Link>
          </div>
          <p className="reveal mt-4 text-sm text-ink-3">Free to use. Try it instantly with realistic demo data.</p>
        </div>
        <div className="relative h-[340px] sm:h-[420px] lg:h-[480px]">
          <Scene3D jars={HERO_JARS} variant="hero" className="absolute inset-0" />
          <Tilt className="absolute bottom-4 left-2 hidden sm:block" max={10}>
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-lg backdrop-blur">
              <LevelRing level={3} progress={64} size={56} stroke={6} />
              <div>
                <p className="text-sm font-semibold">Smart Shopper</p>
                <p className="flex items-center gap-1 text-xs text-ink-2">
                  <StreakFlame days={5} alive size={14} /> 5-day kitchen streak
                </p>
              </div>
            </div>
          </Tilt>
          <Tilt className="absolute top-6 right-2 hidden sm:block" max={10}>
            <div className="rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-lg backdrop-blur">
              <p className="text-xs text-ink-2">Curd · use today</p>
              <p className="font-semibold text-chilli">Rescue it: +15 pts</p>
            </div>
          </Tilt>
        </div>
      </section>

      {/* 30-second tour (filmed from the real app). preload="none" keeps the welcome page fast. */}
      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6" aria-labelledby="tour-title">
        <h2 id="tour-title" className="reveal mb-2 text-center text-[30px] font-[700] sm:text-[36px]">
          See it in 30 seconds
        </h2>
        <p className="reveal mx-auto mb-6 max-w-[52ch] text-center text-ink-2">A quick tour of the 3D shelf, quick add, the cook-along, rewards and languages.</p>
        <div className="reveal overflow-hidden rounded-[24px] border border-line bg-surface shadow-[0_20px_50px_-20px_rgba(20,40,28,.35)]">
          <video className="block aspect-video w-full bg-oat" src="/promo.mp4" poster="/promo-poster.jpg" controls muted playsInline preload="none">
            <a href="/promo.mp4">Download the tour video</a>
          </video>
        </div>
      </section>

      {/* How it works — a real sequence, so it's numbered */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="reveal mb-8 text-center text-[30px] font-[700] sm:text-[36px]">How it works</h2>
        <ol className="grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="reveal" style={{ transitionDelay: `${i * 120}ms` }}>
              <Tilt className="h-full">
                <div className="h-full rounded-3xl border border-line bg-surface p-6">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-full bg-bay font-display font-[700] text-oat">{i + 1}</span>
                    <s.icon className="size-6 text-basil" aria-hidden />
                  </div>
                  <h3 className="text-xl font-[650]">{s.title}</h3>
                  <p className="mt-2 text-ink-2">{s.text}</p>
                </div>
              </Tilt>
            </li>
          ))}
        </ol>
      </section>

      {/* Rewards preview */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="reveal grid items-center gap-8 rounded-[32px] bg-bay p-8 text-oat sm:p-10 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <h2 className="text-[30px] leading-tight font-[700] sm:text-[36px]">Badges for the habits that matter</h2>
            <p className="mt-3 max-w-[46ch] opacity-85">Points come from real actions: using food, rescuing items that are about to expire, cooking, and shopping from your list. Demo data never counts.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-5">
            {[
              { icon: "life-buoy", tier: "bronze" as const, title: "Food rescuer" },
              { icon: "flame", tier: "silver" as const, title: "On a roll" },
              { icon: "chef-hat", tier: "gold" as const, title: "Master chef" },
              { icon: "leaf", tier: "gold" as const, title: "Zero-waste week" },
            ].map((b, i) => (
              <div key={b.title} className="group flex flex-col items-center gap-2" style={{ animationDelay: `${i * 200}ms` }}>
                <Medal badge={{ ...b, earned: true }} size={84} />
                <span className="text-sm font-semibold">{b.title}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="reveal rounded-2xl border border-line bg-surface p-5" style={{ transitionDelay: `${i * 90}ms` }}>
              <f.icon className="mb-3 size-6 text-basil" aria-hidden />
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-ink-2">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-6 pb-16 text-center sm:px-6">
        <h2 className="reveal text-[30px] font-[700]">Start with what's in your kitchen today.</h2>
        <Link to="/register" className="reveal mt-6 inline-block rounded-xl bg-basil px-7 py-3 text-lg font-semibold text-white hover:bg-basil-hover">
          Create your pantry
        </Link>
      </section>

      <footer className="border-t border-line py-6 text-center text-sm text-ink-3">Smart Pantry Manager · Smart Food Inventory & Waste Reduction System</footer>
    </div>
  );
}
