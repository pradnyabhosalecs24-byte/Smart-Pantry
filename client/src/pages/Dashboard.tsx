import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ChefHat, ListPlus, PackagePlus, ShoppingCart, Sparkles, TrendingDown, Upload } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { SimpleBars, StatusDonut } from "../components/charts";
import { CountUp, LevelRing, StreakFlame, Tilt } from "../components/game";
import { Scene3D, type Jar3D } from "../components/three/Scene3D";
import { useAddItem } from "../components/Layout";
import { FreshnessMeter, ItemThumb, LowStockBadge, StatusBadge } from "../components/pantry-bits";
import { Button, Card, CardHeader, EmptyState, ErrorState, Spinner } from "../components/ui";
import { useAuth } from "../context/auth";
import { errorMessage, get, post } from "../lib/api";
import { daysLeftText, fmtDate, money, qty, rate, timeAgo } from "../lib/format";
import { useGamification } from "../lib/gamification";
import { useAction } from "../lib/hooks";
import { STATUS } from "../lib/status";
import type { CompactItem, Dashboard as DashboardData, ItemStatus, RecipeSuggestion } from "../lib/types";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Status strip: the at-a-glance counts, each one a shortcut to the filtered pantry list. */
function StatusStrip({ d }: { d: DashboardData }) {
  const chips: { label: string; count: number; to: string; status?: ItemStatus; low?: boolean }[] = [
    { label: "Expired", count: d.counts.expired, to: "/pantry?status=EXPIRED", status: "EXPIRED" },
    { label: "Expiring soon", count: d.counts.expiring, to: "/pantry?status=EXPIRING", status: "EXPIRING" },
    { label: "Low stock", count: d.counts.lowStock, to: "/pantry?status=LOW_STOCK", low: true },
    { label: "Date missing", count: d.counts.noDate, to: "/pantry?status=NO_DATE", status: "NO_DATE" },
    { label: "Safe", count: d.counts.safe, to: "/pantry?status=SAFE", status: "SAFE" },
  ];
  return (
    <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <Link to="/pantry" className="col-span-2 flex items-center justify-between rounded-2xl bg-bay px-4 py-3 text-oat sm:col-span-1">
        <span className="text-sm font-medium opacity-85">All items</span>
        <span className="num font-display text-[28px] leading-none font-[650]">
          <CountUp value={d.counts.total} />
        </span>
      </Link>
      {chips.map((c) => {
        const s = c.status ? STATUS[c.status] : null;
        const Icon = s?.icon ?? TrendingDown;
        const active = c.count > 0;
        return (
          <Tilt key={c.label} max={9}>
          <Link
            to={c.to}
            className={clsx(
              "flex items-center justify-between gap-2 rounded-2xl border px-4 py-3 transition-colors hover:border-line-strong",
              active ? (c.low ? "border-transparent bg-plum-soft" : `border-transparent ${s!.bg}`) : "border-line bg-surface",
            )}
          >
            <span className={clsx("flex items-center gap-1.5 text-sm font-semibold", active ? (c.low ? "text-plum" : s!.text) : "text-ink-2")}>
              <Icon className="size-4" aria-hidden />
              {c.label}
            </span>
            <span className={clsx("num font-display text-2xl leading-none font-[650]", active ? "text-ink" : "text-ink-3")}>
              <CountUp value={c.count} />
            </span>
          </Link>
          </Tilt>
        );
      })}
    </div>
  );
}

// WebGL can't read CSS variables, so the 3D jars use fixed status colours that match the theme
const JAR_COLOR: Record<ItemStatus, string> = {
  EXPIRED: "#c8402f",
  EXPIRING: "#e0a326",
  SAFE: "#3f9a63",
  NO_DATE: "#7d8a96",
  NO_EXPIRY: "#2e6b4a",
  OUT_OF_STOCK: "#a3a9a5",
};

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Jar fill = share of shelf life left (purchase → expiry), the same rule as the freshness meter. */
function toJar(i: CompactItem, today: string): Jar3D {
  let fill = 0.85;
  if (i.status === "EXPIRED") fill = 0.12;
  else if (i.nextExpiry) {
    const total = Math.max(1, dayDiff(i.nextStart ?? today, i.nextExpiry));
    fill = Math.min(1, Math.max(0.12, dayDiff(today, i.nextExpiry) / total));
  }
  return { id: i.id, label: i.name, sublabel: daysLeftText(i.daysLeft, i.status === "NO_EXPIRY"), fill, color: JAR_COLOR[i.status] };
}

const DEMO_JARS: Jar3D[] = [
  { id: "a", label: "Milk", fill: 0.35, color: JAR_COLOR.EXPIRING },
  { id: "b", label: "Rice", fill: 0.9, color: JAR_COLOR.SAFE },
  { id: "c", label: "Dal", fill: 0.65, color: JAR_COLOR.SAFE },
  { id: "d", label: "Curd", fill: 0.2, color: JAR_COLOR.EXPIRED },
];

/** Greeting, level, streak and this week's challenge beside a 3D shelf of the user's own items. */
function Hero({ title, subtitle, jars, onSelect }: { title: string; subtitle: string; jars: Jar3D[]; onSelect?: (id: string) => void }) {
  const g = useGamification().data;
  useEffect(() => {
    document.title = "Dashboard — Smart Pantry";
  }, []);
  return (
    <Card className="mb-6 overflow-hidden">
      <div className="grid lg:grid-cols-[1fr_1.25fr]">
        <div className="flex flex-col justify-center gap-5 p-6 sm:p-8">
          <div>
            <h1 className="text-[30px] leading-tight font-[700] sm:text-[36px]">{title}</h1>
            <p className="mt-1 text-ink-2">{subtitle}</p>
          </div>
          {g && (
            <Link to="/rewards" className="group flex items-center gap-4 rounded-2xl border border-line bg-surface-2 p-3 hover:border-line-strong">
              <LevelRing level={g.level.number} progress={g.level.progress} size={74} stroke={8} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {g.level.name} · <CountUp value={g.xp} /> pts
                </p>
                <p className="text-sm text-ink-2">{g.level.next ? `${g.level.next.min - g.xp} pts to ${g.level.next.name}` : "Top level reached"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <StreakFlame days={g.streaks.kitchen} alive={g.streaks.kitchen > 0} size={16} />
                    <span>
                      {`${g.streaks.kitchen}-day streak`}
                    </span>
                  </span>
                  <span className="text-ink-2">
                    Challenge: <span className="font-semibold text-ink">{g.challenge.title}</span> {g.challenge.progress}/{g.challenge.target}
                  </span>
                </div>
              </div>
            </Link>
          )}
        </div>
        <div className="relative min-h-[280px] bg-gradient-to-b from-basil-soft/60 to-transparent lg:min-h-[320px]">
          <Scene3D jars={jars} onSelect={onSelect} className="absolute inset-0" />
          {onSelect && <p className="pointer-events-none absolute top-3 right-4 rounded-full bg-surface/85 px-3 py-1 text-xs font-semibold text-ink-2">Your shelf · click a jar</p>}
        </div>
      </div>
    </Card>
  );
}

function Welcome() {
  const openAdd = useAddItem();
  const demo = useAction(() => post<{ items: number }>("/demo"), { success: (r) => `Loaded ${r.items} demo items` });
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-[1.2fr_1fr] md:items-center">
        <div>
          <h2 className="text-2xl font-[650]">Your pantry is empty</h2>
          <p className="mt-2 max-w-[55ch] text-ink-2">
            Add what's in your kitchen with its expiry date. Smart Pantry will tell you what to use first, warn you before food goes off and track what gets wasted.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button icon={PackagePlus} onClick={() => openAdd()}>
              Add your first item
            </Button>
            <Button variant="secondary" icon={Sparkles} onClick={() => demo.mutate()} loading={demo.isPending}>
              Try with demo data
            </Button>
            <Link to="/settings?tab=data" className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-[15px] font-semibold text-ink-2 hover:bg-oat">
              <Upload className="size-4" aria-hidden />
              Import a CSV
            </Link>
          </div>
          <p className="mt-3 text-xs text-ink-3">Demo items are labelled and can be removed in one click from Settings.</p>
        </div>
        <ul className="grid gap-3 text-sm">
          {[
            ["Batches, not just items", "Two packs of milk bought on different days keep their own expiry dates. Using stock always takes the oldest first."],
            ["Opened changes the clock", "Mark a jar as opened and its shelf life shortens automatically."],
            ["Waste you can see", "Record what's thrown away and why, then watch the monthly trend fall."],
          ].map(([t, d]) => (
            <li key={t} className="rounded-xl bg-oat p-3">
              <p className="font-semibold">{t}</p>
              <p className="text-ink-2">{d}</p>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => get<DashboardData>("/dashboard") });
  const recipes = useQuery({ queryKey: ["recipes"], queryFn: () => get<{ suggestions: RecipeSuggestion[] }>("/recipes/suggestions"), enabled: (q.data?.counts.total ?? 0) > 0 });
  const addLow = useAction(() => post<{ added: number; skipped: number }>("/shopping/from-low-stock"), {
    success: (r) => (r.added ? `Added ${r.added} item(s) to your shopping list` : "Everything low is already on your list"),
  });

  const title = `${greeting()}, ${user?.name.split(" ")[0] ?? ""}`;
  if (q.isLoading) return <Spinner label="Loading your pantry" />;
  if (q.error) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data!;

  if (d.counts.total === 0) {
    return (
      <>
        <Hero title={title} subtitle="Let's set up your pantry. Every jar on this shelf will be one of your items." jars={DEMO_JARS} />
        <Welcome />
      </>
    );
  }

  const topRecipe = recipes.data?.suggestions[0];
  // Up to 6 jars: most urgent first, then recently added items in stock
  const shelf = [...d.expiringSoon, ...d.recentItems.filter((r) => r.quantity > 0)]
    .filter((x, i, arr) => arr.findIndex((y) => y.id === x.id) === i)
    .slice(0, 6)
    .map((i) => toJar(i, d.today));

  return (
    <>
      <Hero
        title={title}
        subtitle={`Today is ${fmtDate(d.today)}. Jar fill shows how much shelf life is left; colour shows status.`}
        jars={shelf}
        onSelect={(id) => navigate(`/pantry/${id}`)}
      />
      <StatusStrip d={d} />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Use these first — the heart of the dashboard */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Use these first"
            description="Expired and expiring items, most urgent at the top"
            action={
              <Link to="/pantry?status=ATTENTION" className="text-sm font-semibold text-basil hover:underline">
                See all
              </Link>
            }
          />
          {d.expiringSoon.length === 0 ? (
            <EmptyState title="Nothing is close to its date">Everything in stock is within date for at least {d.warningDays + 1} more days.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {d.expiringSoon.map((i) => (
                <li key={i.id}>
                  <Link to={`/pantry/${i.id}`} className="grid grid-cols-[2.75rem_1fr] items-center gap-x-3 gap-y-2 px-5 py-3 hover:bg-surface-2 sm:grid-cols-[2.75rem_1fr_8rem_auto]">
                    <ItemThumb name={i.name} category={i.category} imageId={i.imageId} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{i.name}</p>
                      <p className="truncate text-sm text-ink-2">
                        {qty(i.quantity, i.unit)} in {i.location}
                      </p>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <FreshnessMeter start={i.nextStart} expiry={i.nextExpiry} today={d.today} status={i.status} daysLeft={i.daysLeft} compact />
                    </div>
                    <StatusBadge status={i.status} className="hidden sm:inline-flex" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Running out soon" description="Estimated from your last 30 days of use" />
          {d.predictions.length === 0 ? (
            <EmptyState title="Not enough history yet">Record what you use and forecasts appear here after a couple of entries per item.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {d.predictions.map((p) => (
                <li key={p.itemId} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link to={`/pantry/${p.itemId}`} className="truncate font-semibold hover:underline">
                      {p.name}
                    </Link>
                    <p className="text-sm text-ink-2">
                      {`About ${p.daysLeft} day${p.daysLeft === 1 ? "" : "s"} left · ~${rate(p.dailyRate)} ${p.unit}/day`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="subtle"
                    icon={ListPlus}
                    aria-label={`Add ${p.name} to shopping list`}
                    onClick={() =>
                      post("/shopping", { name: p.name, quantity: Math.max(1, Math.ceil(p.dailyRate * 7)), unit: p.unit, itemId: p.itemId })
                        .then(() => toast.success(`${p.name} added to your shopping list`))
                        .catch((e) => toast.error(errorMessage(e)))
                    }
                  >
                    List
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Pantry status" />
          <div className="px-5 pb-5">
            <StatusDonut data={d.statusBreakdown} />
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Items by category" description="Number of items in each category" />
          <div className="px-3 pb-4 sm:px-5">
            <SimpleBars data={d.categoryBreakdown} xKey="category" yKey="items" valueLabel="Items" horizontal height={Math.max(180, d.categoryBreakdown.length * 26)} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Low stock"
            action={
              d.lowStock.length > 0 && (
                <Button size="sm" variant="subtle" icon={ShoppingCart} onClick={() => addLow.mutate()} loading={addLow.isPending}>
                  Add all to list
                </Button>
              )
            }
          />
          {d.lowStock.length === 0 ? (
            <EmptyState title="Stock levels look good">Set a minimum stock on items to be warned before you run out.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {d.lowStock.map((i) => (
                <li key={i.id}>
                  <Link to={`/pantry/${i.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{i.name}</p>
                      <p className="num text-sm text-ink-2">
                        {qty(i.quantity, i.unit)} left · minimum {qty(i.minStock, i.unit)}
                      </p>
                    </div>
                    <LowStockBadge />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Cook with what's expiring" />
          {topRecipe ? (
            <div className="px-5 pb-5">
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-turmeric-soft text-turmeric">
                  <ChefHat className="size-5" aria-hidden />
                </div>
                <div>
                  <p className="font-display text-lg font-[650]">{topRecipe.recipe.name}</p>
                  <p className="text-sm text-ink-2">
                    {topRecipe.recipe.minutes} min · uses {topRecipe.matched.map((m) => m.itemName).join(", ")}
                  </p>
                </div>
              </div>
              <Link to={`/recipes/library/${topRecipe.recipe.id}`} className="mt-4 inline-flex text-sm font-semibold text-basil hover:underline">
                View recipe & cook along
              </Link>
            </div>
          ) : (
            <EmptyState title="No suggestions right now">Recipes appear when your in-date items match an ingredient list.</EmptyState>
          )}
        </Card>

        <Card>
          <CardHeader title="Last 30 days" />
          <div className="grid grid-cols-2 gap-3 px-5 pb-5">
            <div className="rounded-xl bg-oat p-3">
              <p className="text-sm text-ink-2">Times food was wasted</p>
              <p className="num font-display text-2xl font-[650]">{d.waste30.events}</p>
            </div>
            <div className="rounded-xl bg-oat p-3">
              <p className="text-sm text-ink-2">Estimated cost</p>
              <p className="num font-display text-2xl font-[650]">{money(d.waste30.estimatedCost, d.currency)}</p>
            </div>
            <p className="col-span-2 text-xs text-ink-3">
              Estimates use the prices you entered.{d.waste30.withoutPrice > 0 && ` ${d.waste30.withoutPrice} record(s) had no price and aren't counted.`}
            </p>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent activity"
            action={
              <Link to="/activity" className="text-sm font-semibold text-basil hover:underline">
                Activity log
              </Link>
            }
          />
          {d.recentActivity.length === 0 ? (
            <EmptyState title="No activity yet" />
          ) : (
            <ul className="px-5 pb-4">
              {d.recentActivity.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-4 border-b border-line py-2 text-sm last:border-0">
                  <span>{a.message}</span>
                  <span className="shrink-0 text-xs text-ink-3">{timeAgo(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Recently added" />
          <ul className="px-5 pb-4">
            {d.recentItems.map((i) => (
              <li key={i.id} className="flex items-center gap-3 border-b border-line py-2 last:border-0">
                <ItemThumb name={i.name} category={i.category} imageId={i.imageId} size="sm" />
                <Link to={`/pantry/${i.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline">
                  {i.name}
                </Link>
                <span className="shrink-0 text-xs text-ink-3">{timeAgo(i.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
