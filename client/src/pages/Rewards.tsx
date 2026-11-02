import { Leaf, Target } from "lucide-react";
import { BadgeCard, CountUp, LevelRing, StreakFlame, Tilt } from "../components/game";
import { Card, CardHeader, ErrorState, PageHeader, Spinner } from "../components/ui";
import { errorMessage } from "../lib/api";
import { fmtDate } from "../lib/format";
import { useGamification } from "../lib/gamification";

export function RewardsPage() {
  const q = useGamification();
  if (q.isLoading) return <Spinner label="Loading rewards" />;
  if (q.error) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const g = q.data!;
  const earned = g.badges.filter((b) => b.earned).length;
  const ways = [
    { label: "Use food", pts: g.points.use, total: g.breakdown.uses },
    { label: "Rescue food that's expiring soon (bonus)", pts: g.points.rescue, total: g.breakdown.rescues },
    { label: "Cook a recipe and tap “I cooked this”", pts: g.points.cook, total: g.breakdown.cooks },
    { label: "Add or restock an item", pts: g.points.add, total: g.breakdown.adds },
    { label: "Buy from your shopping list", pts: g.points.purchase, total: g.breakdown.purchases },
    { label: "Record waste honestly", pts: g.points.honestWaste, total: g.breakdown.honesty },
    { label: "Complete weekly challenges", pts: null, total: g.breakdown.challenges },
  ];
  const challengePct = Math.round((g.challenge.progress / g.challenge.target) * 100);

  return (
    <>
      <PageHeader title="Rewards" description="Earn points for using food before it's wasted. Demo data never counts, and repeated actions are capped each day, so points reflect real habits." />

      <div className="mb-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex flex-col items-center gap-6 bg-gradient-to-br from-basil-soft to-surface p-6 sm:flex-row sm:p-8">
            <LevelRing level={g.level.number} progress={g.level.progress} size={150} stroke={12} />
            <div className="text-center sm:text-left">
              <p className="text-sm font-semibold text-basil">Level {g.level.number}</p>
              <h2 className="font-display text-[32px] leading-tight font-[700]">{g.level.name}</h2>
              <p className="mt-1 text-ink-2">
                <span className="font-display text-2xl font-[650] text-ink">
                  <CountUp value={g.xp} />
                </span>{" "}
                points
              </p>
              {g.level.next ? (
                <p className="mt-2 text-sm text-ink-2">
                  <span className="num font-semibold text-ink">{g.level.next.min - g.xp}</span> more to reach <span className="font-semibold">{g.level.next.name}</span>
                </p>
              ) : (
                <p className="mt-2 text-sm font-semibold text-basil">Top level reached.</p>
              )}
            </div>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <Tilt>
            <Card className="flex h-full items-center gap-4 p-5">
              <StreakFlame days={g.streaks.kitchen} alive={g.streaks.kitchen > 0} size={46} />
              <div>
                <p className="text-sm text-ink-2">Kitchen streak</p>
                <p className="font-display text-3xl leading-tight font-[700]">
                  <CountUp value={g.streaks.kitchen} /> <span className="text-base font-[500] text-ink-2">day{g.streaks.kitchen === 1 ? "" : "s"}</span>
                </p>
                <p className="text-xs text-ink-3">{g.streaks.usedToday ? "Done for today" : g.streaks.kitchen ? "Use something today to keep it going" : "Use food today to start one"} · best {g.streaks.bestKitchen}</p>
              </div>
            </Card>
          </Tilt>
          <Tilt>
            <Card className="flex h-full items-center gap-4 p-5">
              <div className="flex size-12 items-center justify-center rounded-full bg-basil-soft text-basil">
                <Leaf className="size-6" aria-hidden />
              </div>
              <div>
                <p className="text-sm text-ink-2">Waste-free</p>
                <p className="font-display text-3xl leading-tight font-[700]">
                  <CountUp value={g.streaks.wasteFree} /> <span className="text-base font-[500] text-ink-2">day{g.streaks.wasteFree === 1 ? "" : "s"}</span>
                </p>
                <p className="text-xs text-ink-3">Days since food was last thrown away</p>
              </div>
            </Card>
          </Tilt>
        </div>
      </div>

      <Card className="mb-5">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-turmeric-soft text-turmeric">
            <Target className="size-6" aria-hidden />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-turmeric">This week's challenge · ends {fmtDate(g.challenge.endsOn)}</p>
            <h2 className="text-xl font-[650]">{g.challenge.title}</h2>
            <p className="text-ink-2">{g.challenge.description}</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={g.challenge.progress} aria-valuemin={0} aria-valuemax={g.challenge.target} aria-label="Challenge progress">
                <div className="h-full rounded-full bg-gradient-to-r from-basil to-turmeric-bar transition-[width] duration-1000" style={{ width: `${challengePct}%` }} />
              </div>
              <span className="num text-sm font-semibold">
                {g.challenge.progress}/{g.challenge.target}
              </span>
            </div>
          </div>
          <div className="text-center sm:pl-4">
            <p className={`font-display text-2xl font-[700] ${g.challenge.completed ? "text-basil" : "text-ink"}`}>+{g.challenge.reward}</p>
            <p className="text-xs text-ink-3">{g.challenge.completed ? "Completed" : "points"}</p>
          </div>
        </div>
      </Card>

      <Card className="mb-5">
        <CardHeader title={`Badges · ${earned} of ${g.badges.length}`} description="Tap a badge to see how to earn it." />
        <div className="grid grid-cols-2 gap-3 px-5 pb-5 sm:grid-cols-3 lg:grid-cols-5">
          {[...g.badges].sort((a, b) => Number(b.earned) - Number(a.earned)).map((b) => (
            <BadgeCard key={b.key} badge={b} />
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="How you earn points" />
        <ul className="divide-y divide-line border-t border-line">
          {ways.map((w) => (
            <li key={w.label} className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm">
              <span>{w.label}</span>
              <span className="flex items-center gap-4">
                {w.pts != null && <span className="text-ink-3">+{w.pts} each</span>}
                <span className="num w-16 text-right font-semibold">{w.total} pts</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
