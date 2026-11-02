import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ChefHat, Clock, Globe, Search, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { CookScene } from "../components/CookScene";
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Spinner, Tabs } from "../components/ui";
import { errorMessage, get } from "../lib/api";
import { daysLeftText } from "../lib/format";
import type { CookAction, ItemStatus, OnlineSummary, RecipeSuggestion, RecipeSummary } from "../lib/types";
import { StatusBadge } from "../components/pantry-bits";

type Tab = "explore" | "use-up";

const DIET_STYLE: Record<RecipeSummary["diet"], string> = {
  Veg: "bg-basil-soft text-bay",
  Vegan: "bg-basil-soft text-bay",
  Egg: "bg-turmeric-soft text-turmeric",
};

// A representative animation for each course, used as the card picture for built-in recipes
const COURSE_SCENE: Record<string, CookAction> = { Breakfast: "fry", Main: "simmer", Side: "temper", Snack: "fry", Dessert: "mix", Drink: "blend", Soup: "boil" };

function LibraryCard({ r }: { r: RecipeSummary }) {
  return (
    <Link to={`/recipes/library/${r.id}`} className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-line-strong">
      <div className="bg-oat">
        <CookScene action={r.signature ?? COURSE_SCENE[r.course] ?? "serve"} label={false} className="scene-paused pointer-events-none aspect-[16/7] w-full" />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-lg font-[650] group-hover:underline">{r.name}</h3>
        <p className="text-sm text-ink-2">
          {r.cuisine} · {r.course}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3 text-sm text-ink-2">
          <Badge className={DIET_STYLE[r.diet]}>{r.diet}</Badge>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden /> {r.minutes} min
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden /> Serves {r.servings}
          </span>
          <span>{r.stepCount} steps</span>
        </div>
      </div>
    </Link>
  );
}

function OnlineCard({ r }: { r: OnlineSummary }) {
  const [broken, setBroken] = useState(false);
  return (
    <Link to={`/recipes/online/${r.id}`} className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface hover:border-line-strong">
      {broken ? (
        <div className="flex aspect-[16/10] items-center justify-center bg-oat text-ink-3">
          <ChefHat className="size-8" aria-hidden />
        </div>
      ) : (
        <img src={`${r.image}/preview`} alt="" loading="lazy" onError={() => setBroken(true)} className="aspect-[16/10] w-full object-cover" />
      )}
      <div className="p-3">
        <h3 className="font-semibold group-hover:underline">{r.name}</h3>
        <p className="text-xs text-ink-3">With video, from TheMealDB</p>
      </div>
    </Link>
  );
}

function Explore() {
  const [params, setParams] = useSearchParams();
  const ingredient = params.get("q") ?? "";
  const [input, setInput] = useState(ingredient);
  const chips = useQuery({ queryKey: ["recipe-ingredients"], queryFn: () => get<{ pantry: { name: string; status: ItemStatus; daysLeft: number | null }[]; popular: string[]; libraryCount: number }>("/recipes/ingredients") });
  const q = useQuery({
    queryKey: ["explore", ingredient],
    queryFn: () => get<{ library: RecipeSummary[]; online: OnlineSummary[]; onlineStatus: "ok" | "none" | "unavailable" | "disabled" }>("/recipes/explore", { ingredient }),
    enabled: ingredient.length >= 2,
    staleTime: 10 * 60_000,
  });

  const pick = (name: string) => {
    setInput(name);
    setParams({ tab: "explore", q: name }, { replace: true });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim().length >= 2) pick(input.trim());
  };

  return (
    <>
      <Card className="mb-5 p-4 sm:p-5">
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row" role="search">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input aria-label="Ingredient" placeholder="Type an ingredient, e.g. potato, paneer, egg" value={input} onChange={(e) => setInput(e.target.value)} className="pl-9" maxLength={50} />
          </div>
          <Button type="submit" disabled={input.trim().length < 2}>
            Find dishes
          </Button>
        </form>
        {chips.data && (
          <div className="mt-4 grid gap-3">
            {chips.data.pantry.length > 0 && (
              <div>
                <p className="mb-1.5 text-sm font-semibold text-ink-2">From your pantry, use soonest first</p>
                <div className="flex flex-wrap gap-1.5">
                  {chips.data.pantry.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => pick(c.name)}
                      className={clsx(
                        "rounded-full border px-3 py-1 text-sm font-semibold",
                        ingredient === c.name ? "border-basil bg-basil text-white" : c.status === "EXPIRING" ? "border-turmeric/40 bg-turmeric-soft text-ink" : "border-line-strong bg-surface hover:bg-oat",
                      )}
                      title={c.status === "EXPIRING" ? daysLeftText(c.daysLeft) : undefined}
                    >
                      {c.name}
                      {c.status === "EXPIRING" && <span className="ml-1 text-xs font-medium text-turmeric">· {daysLeftText(c.daysLeft).toLowerCase()}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="mb-1.5 text-sm font-semibold text-ink-2">Popular ingredients</p>
              <div className="flex flex-wrap gap-1.5">
                {chips.data.popular.map((name) => (
                  <button key={name} onClick={() => pick(name)} className={clsx("rounded-full border px-3 py-1 text-sm font-semibold", ingredient.toLowerCase() === name.toLowerCase() ? "border-basil bg-basil text-white" : "border-line-strong bg-surface hover:bg-oat")}>
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      {!ingredient ? (
        <Card>
          <EmptyState icon={ChefHat} title="What do you want to cook with?">
            Pick an ingredient to see every dish you can make with it, with exact quantities and an animated step-by-step guide.
          </EmptyState>
        </Card>
      ) : q.isLoading ? (
        <Spinner label={`Finding dishes with ${ingredient}`} />
      ) : q.error ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <>
          <section aria-labelledby="lib-h" className="mb-8">
            <h2 id="lib-h" className="mb-3 text-xl font-[650]">
              {q.data!.library.length} dish{q.data!.library.length === 1 ? "" : "es"} with {ingredient}
              <span className="ml-2 text-sm font-normal text-ink-2">with quantities and cook-along</span>
            </h2>
            {q.data!.library.length === 0 ? (
              <Card>
                <EmptyState title={`No built-in recipes use ${ingredient} yet`}>Try another spelling (e.g. “aloo” or “potato”), or see the online results below.</EmptyState>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {q.data!.library.map((r) => (
                  <LibraryCard key={r.id} r={r} />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="online-h">
            <h2 id="online-h" className="mb-1 flex items-center gap-2 text-xl font-[650]">
              <Globe className="size-5 text-ink-2" aria-hidden />
              More recipes online
            </h2>
            <p className="mb-3 text-sm text-ink-2">From TheMealDB, a free recipe database. Most include a cooking video.</p>
            {q.data!.onlineStatus === "ok" ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {q.data!.online.map((r) => (
                  <OnlineCard key={r.id} r={r} />
                ))}
              </div>
            ) : (
              <p role="status" className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-2">
                {q.data!.onlineStatus === "none" && `No online recipes found for “${ingredient}”. Online recipes use English names, so try “potato” instead of “aloo”.`}
                {q.data!.onlineStatus === "unavailable" && "The online recipe service can't be reached right now. The built-in recipes above still work."}
                {q.data!.onlineStatus === "disabled" && "Online recipes are turned off on this server."}
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}

function UseItUp() {
  const q = useQuery({ queryKey: ["recipes"], queryFn: () => get<{ suggestions: RecipeSuggestion[]; expiringCount: number; note: string }>("/recipes/suggestions") });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (!q.data!.suggestions.length)
    return (
      <Card>
        <EmptyState icon={ChefHat} title="No recipe matches yet">
          Suggestions appear when in-date items in your pantry (like rice, milk, eggs, potatoes or bread) match a recipe's ingredients.
        </EmptyState>
      </Card>
    );
  return (
    <>
      <p className="mb-4 text-sm text-ink-2">{q.data!.note}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {q.data!.suggestions.map((s) => (
          <Card key={s.recipe.id} as="article" className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-[650]">{s.recipe.name}</h2>
                <p className="flex items-center gap-1.5 text-sm text-ink-2">
                  {s.recipe.cuisine} <span aria-hidden>·</span>
                  <Clock className="size-3.5" aria-hidden /> {s.recipe.minutes} min
                </p>
              </div>
              {s.urgentCount > 0 && <span className="rounded-full bg-turmeric-soft px-2.5 py-1 text-xs font-bold whitespace-nowrap text-turmeric">Saves {s.urgentCount} expiring</span>}
            </div>
            <h3 className="mt-4 text-sm font-semibold text-ink-2">From your pantry</h3>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {s.matched.map((m) => (
                <li key={m.ingredient} className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{m.itemName}</span>
                  {m.status === "EXPIRING" ? <span className="text-xs font-semibold text-turmeric">{daysLeftText(m.daysLeft)}</span> : <StatusBadge status={m.status} />}
                </li>
              ))}
            </ul>
            {s.missing.length > 0 && <p className="mt-3 text-sm text-ink-2">You'd also need: {s.missing.join(", ")}</p>}
            <Link to={`/recipes/library/${s.recipe.id}`} className="mt-4 self-start rounded-lg bg-basil px-3 py-1.5 text-sm font-semibold text-white hover:bg-basil-hover">
              View recipe & cook along
            </Link>
          </Card>
        ))}
      </div>
    </>
  );
}

export function RecipesPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "explore";
  return (
    <>
      <PageHeader title="Recipes" description="Find dishes for what you have, with exact quantities and an animated step-by-step guide." />
      <div className="mb-5">
        <Tabs<Tab>
          value={tab}
          onChange={(v) => setParams(v === "explore" ? { tab: v, q: params.get("q") ?? "" } : { tab: v }, { replace: true })}
          tabs={[
            { value: "explore", label: "Explore by ingredient" },
            { value: "use-up", label: "Use it up" },
          ]}
        />
      </div>
      {tab === "explore" ? <Explore /> : <UseItUp />}
    </>
  );
}
