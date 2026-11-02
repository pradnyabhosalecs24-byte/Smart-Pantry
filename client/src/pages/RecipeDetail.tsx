import { keepPreviousData, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowLeft, Check, Clock, ExternalLink, Minus, Play, Plus, ShoppingCart, Users, X as XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { CookAlong, type CookStep } from "../components/CookAlong";
import { ACTION_LABEL, CookScene } from "../components/CookScene";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, IconButton, Input, Modal, Select, Spinner } from "../components/ui";
import { ApiError, errorMessage, get, post } from "../lib/api";
import { compatibleUnits, fmtAmount, qty as fmtQty } from "../lib/format";
import { useRefreshAll } from "../lib/hooks";
import type { CookAction, LibraryRecipeDetail, OnlineRecipeDetail, PantryMatch } from "../lib/types";

/** One shape for both built-in and online recipes, so the page renders them the same way. */
interface View {
  name: string;
  meta: string[];
  image: string | null;
  youtubeId: string | null;
  videoSearch: string;
  sourceUrl: string | null;
  minutes: number | null;
  servings: number | null;
  scalable: boolean;
  ingredients: { name: string; amount: string; optional: boolean; pantry: PantryMatch | null }[];
  steps: CookStep[];
}

function fromLibrary(d: LibraryRecipeDetail): View {
  return {
    name: d.recipe.name,
    meta: [d.recipe.cuisine, d.recipe.course, d.recipe.diet],
    image: null,
    youtubeId: null,
    videoSearch: d.recipe.video,
    sourceUrl: null,
    minutes: d.recipe.minutes,
    servings: d.servings,
    scalable: true,
    ingredients: d.ingredients.map((i) => ({ name: i.name, amount: fmtAmount(i.qty, i.unit), optional: i.optional, pantry: i.pantry })),
    steps: d.recipe.steps.map((s) => ({ text: s.text, action: s.action, minutes: s.minutes, uses: s.uses.map((u) => (u.qty == null ? u.name : `${fmtAmount(u.qty, u.unit)} ${u.name}`)) })),
  };
}

function fromOnline(d: OnlineRecipeDetail): View {
  return {
    name: d.recipe.name,
    meta: [d.recipe.cuisine, d.recipe.category].filter(Boolean) as string[],
    image: d.recipe.image,
    youtubeId: d.recipe.youtubeId,
    videoSearch: `${d.recipe.name} recipe`,
    sourceUrl: d.recipe.sourceUrl,
    minutes: null,
    servings: null,
    scalable: false,
    ingredients: d.ingredients.map((i) => ({ name: i.name, amount: i.measure, optional: false, pantry: i.pantry })),
    steps: d.recipe.steps,
  };
}

function PantryNote({ p }: { p: PantryMatch | null }) {
  if (!p) return <span className="text-xs text-ink-3">Not in pantry</span>;
  const short = p.enough === false;
  return (
    <Link to={`/pantry/${p.itemId}`} className={clsx("inline-flex items-center gap-1 text-xs font-semibold hover:underline", short ? "text-turmeric" : "text-basil")}>
      {short ? <XIcon className="size-3.5" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
      {short ? `Only ${fmtQty(p.available, p.unit)} in pantry` : `In pantry (${fmtQty(p.available, p.unit)})`}
      {p.status === "EXPIRING" && <span className="text-turmeric">· use soon</span>}
    </Link>
  );
}

/** "I cooked this": confirm how much of each pantry item was used, then record it all at once. */
function CookedDialog({ open, onClose, view }: { open: boolean; onClose: () => void; view: View }) {
  const refresh = useRefreshAll();
  const initial = useMemo(() => {
    const rows = new Map<string, { itemId: string; itemName: string; unit: string; qty: string; checked: boolean; ingredient: string; available: number }>();
    for (const ing of view.ingredients) {
      if (!ing.pantry || rows.has(ing.pantry.itemId)) continue;
      const n = ing.pantry.needed;
      rows.set(ing.pantry.itemId, {
        itemId: ing.pantry.itemId,
        itemName: ing.pantry.itemName,
        unit: ing.pantry.unit,
        qty: n != null ? String(Math.min(n, ing.pantry.available)) : "",
        checked: n != null && !ing.optional,
        ingredient: ing.name,
        available: ing.pantry.available,
      });
    }
    return [...rows.values()];
  }, [view]);
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [lastKey, setLastKey] = useState("");
  const key = `${open}-${view.name}-${view.servings}`;
  if (key !== lastKey) {
    setLastKey(key);
    setRows(initial);
  }

  const chosen = rows.filter((r) => r.checked);
  const invalid = chosen.some((r) => !(Number(r.qty) > 0));

  async function save() {
    setBusy(true);
    try {
      const r = await post<{ recorded: { name: string }[]; failed: { itemId: string; message: string }[] }>("/recipes/cooked", {
        recipeName: view.name,
        uses: chosen.map((c) => ({ itemId: c.itemId, quantity: Number(c.qty), unit: c.unit })),
      });
      refresh();
      if (r.recorded.length) toast.success(`Recorded ${r.recorded.length} ingredient(s) as used for ${view.name}`);
      if (r.failed.length) {
        const names = r.failed.map((f) => `${rows.find((x) => x.itemId === f.itemId)?.itemName}: ${f.message}`);
        toast.error(`Not recorded: ${names.join("; ")}`);
      } else onClose();
    } catch (e) {
      if (e instanceof ApiError && e.details && Array.isArray((e.details as { failed?: unknown }).failed)) toast.error("None of the ingredients could be recorded. Check the quantities.");
      else toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Update your pantry"
      description="Tick what you used. Stock is taken from the batch that expires first."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={busy} disabled={!chosen.length || invalid}>
            Record {chosen.length} ingredient{chosen.length === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      {rows.length === 0 ? (
        <p className="text-ink-2">None of this recipe's ingredients are in your pantry, so there's nothing to update.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r, i) => (
            <li key={r.itemId} className="flex flex-wrap items-center gap-3 py-2.5">
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <input type="checkbox" className="size-4 accent-[var(--basil)]" checked={r.checked} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x)))} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{r.itemName}</span>
                  <span className="block text-xs text-ink-3">
                    for {r.ingredient} · {fmtQty(r.available, r.unit)} available
                  </span>
                </span>
              </label>
              <div className="flex items-center gap-1">
                <Input aria-label={`Amount of ${r.itemName} used`} type="number" min="0" step="any" value={r.qty} disabled={!r.checked} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} className="h-9 w-24 text-right num" invalid={r.checked && !(Number(r.qty) > 0)} />
                <Select aria-label={`Unit for ${r.itemName}`} value={r.unit} disabled={!r.checked} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} className="h-9 w-20">
                  {compatibleUnits(rows[i].unit).map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.value}
                    </option>
                  ))}
                </Select>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export function RecipeDetailPage({ source }: { source: "library" | "online" }) {
  const { id = "" } = useParams();
  const [servings, setServings] = useState<number | null>(null);
  const [cooking, setCooking] = useState(false);
  const [cookedOpen, setCookedOpen] = useState(false);

  const q = useQuery({
    queryKey: ["recipe", source, id, servings],
    queryFn: async () => (source === "library" ? fromLibrary(await get<LibraryRecipeDetail>(`/recipes/library/${id}`, { servings: servings ?? undefined })) : fromOnline(await get<OnlineRecipeDetail>(`/recipes/online/${id}`))),
    placeholderData: keepPreviousData,
  });

  const missing = useMemo(() => (q.data ? q.data.ingredients.filter((i) => !i.optional && (!i.pantry || i.pantry.enough === false)) : []), [q.data]);

  if (q.isLoading) return <Spinner label="Loading recipe" />;
  if (q.error) {
    if (q.error instanceof ApiError && q.error.status === 404)
      return <EmptyState title="Recipe not found" action={<Link to="/recipes" className="font-semibold text-basil hover:underline">Back to recipes</Link>} />;
    return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  }
  const v = q.data!;
  document.title = `${v.name} — Smart Pantry`;
  const n = v.servings ?? 1;

  async function addMissingToList() {
    let added = 0;
    for (const m of missing) {
      try {
        await post("/shopping", { name: m.name, quantity: 1, unit: "pack", note: `For ${v.name}` });
        added++;
      } catch (e) {
        if (!(e instanceof ApiError && e.code === "DUPLICATE_ENTRY")) toast.error(errorMessage(e));
      }
    }
    toast.success(added ? `Added ${added} ingredient(s) to your shopping list` : "Those ingredients are already on your list");
  }

  const actions = [...new Set(v.steps.map((s) => s.action))] as CookAction[];

  return (
    <>
      <Link to="/recipes" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        Recipes
      </Link>

      <div className="mb-6 grid gap-5 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <h1 className="text-[32px] leading-tight font-[650] sm:text-[38px]">{v.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-2">
            {v.meta.map((m) => (
              <Badge key={m} className="bg-surface text-ink-2 border border-line">
                {m}
              </Badge>
            ))}
            {v.minutes && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-4" aria-hidden /> {v.minutes} min
              </span>
            )}
            <span>{v.steps.length} steps</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button icon={Play} onClick={() => setCooking(true)} disabled={!v.steps.length}>
              Start cook-along
            </Button>
            <Button variant="secondary" onClick={() => setCookedOpen(true)}>
              I cooked this
            </Button>
          </div>
          <p className="mt-3 text-sm text-ink-3">The cook-along animates and reads out each step, with timers for the cooking times.</p>
        </div>
        <div className="overflow-hidden rounded-3xl border border-line bg-surface">
          {v.image ? <img src={v.image} alt={v.name} className="aspect-[16/10] w-full object-cover" /> : <CookScene action={v.steps[0]?.action ?? "serve"} className="aspect-[16/10] w-full" />}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Card className="self-start">
          <CardHeader
            title="Ingredients"
            description={v.scalable ? "Amounts update when you change servings" : "Amounts as given by the online recipe"}
            action={
              v.scalable && (
                <div className="flex items-center gap-1 rounded-xl border border-line p-0.5" role="group" aria-label="Servings">
                  <IconButton icon={Minus} label="Fewer servings" onClick={() => setServings(Math.max(1, n - 1))} disabled={n <= 1} className="size-8" />
                  <span className="num flex items-center gap-1 px-1 text-sm font-semibold" aria-live="polite">
                    <Users className="size-4 text-ink-2" aria-hidden /> {n}
                  </span>
                  <IconButton icon={Plus} label="More servings" onClick={() => setServings(Math.min(20, n + 1))} disabled={n >= 20} className="size-8" />
                </div>
              )
            }
          />
          <ul className={clsx("divide-y divide-line border-t border-line", q.isFetching && "opacity-60")}>
            {v.ingredients.map((ing) => (
              <li key={ing.name} className="flex items-start justify-between gap-3 px-5 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium">
                    {ing.name}
                    {ing.optional && <span className="ml-1 text-xs font-normal text-ink-3">(optional)</span>}
                  </p>
                  <PantryNote p={ing.pantry} />
                </div>
                <span className="num shrink-0 text-right font-semibold whitespace-nowrap">{ing.amount}</span>
              </li>
            ))}
          </ul>
          {missing.length > 0 && (
            <div className="border-t border-line px-5 py-3">
              <p className="mb-2 text-sm text-ink-2">
                Missing or short: {missing.map((m) => m.name).join(", ")}
              </p>
              <Button size="sm" variant="subtle" icon={ShoppingCart} onClick={() => void addMissingToList()}>
                Add missing to shopping list
              </Button>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Video" description={v.youtubeId ? "Cooking video for this recipe" : "Watch how others cook this dish"} />
            <div className="px-5 pb-5">
              {v.youtubeId ? (
                <>
                  <div className="aspect-video overflow-hidden rounded-xl bg-black">
                    <iframe
                      className="h-full w-full"
                      src={`https://www.youtube-nocookie.com/embed/${v.youtubeId}`}
                      title={`${v.name} video`}
                      loading="lazy"
                      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                  <a href={`https://www.youtube.com/watch?v=${v.youtubeId}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-basil hover:underline">
                    Open on YouTube <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                </>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex -space-x-3" aria-hidden>
                    {actions.slice(0, 3).map((a) => (
                      <div key={a} className="size-16 overflow-hidden rounded-full border-2 border-surface bg-oat">
                        <CookScene action={a} label={false} className="h-full w-full scale-150" />
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button icon={Play} onClick={() => setCooking(true)}>
                      Play animated guide
                    </Button>
                    <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(v.videoSearch)}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-[15px] font-semibold hover:bg-surface-2">
                      Find videos on YouTube <ExternalLink className="size-4" aria-hidden />
                    </a>
                  </div>
                </div>
              )}
              {v.sourceUrl && (
                <a href={v.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 ml-4 inline-flex items-center gap-1 text-sm font-semibold text-ink-2 hover:underline">
                  Original recipe <ExternalLink className="size-3.5" aria-hidden />
                </a>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Method" />
            <ol className="px-5 pb-5">
              {v.steps.map((s, i) => (
                <li key={i} className="flex gap-4 border-b border-line py-3 last:border-0">
                  <span className="num flex size-8 shrink-0 items-center justify-center rounded-full bg-basil-soft font-display font-[650] text-bay">{i + 1}</span>
                  <div className="min-w-0">
                    <p>{s.text}</p>
                    <p className="mt-1 text-xs text-ink-3">
                      {ACTION_LABEL[s.action]}
                      {s.minutes ? ` · about ${s.minutes} min` : ""}
                      {s.uses && s.uses.length > 0 ? ` · ${s.uses.join(", ")}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      {cooking && (
        <CookAlong
          title={v.name}
          steps={v.steps}
          onClose={() => setCooking(false)}
          onFinish={() => {
            setCooking(false);
            setCookedOpen(true);
          }}
        />
      )}
      <CookedDialog open={cookedOpen} onClose={() => setCookedOpen(false)} view={v} />
    </>
  );
}
