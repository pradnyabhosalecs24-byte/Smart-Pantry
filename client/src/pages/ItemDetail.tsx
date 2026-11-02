import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ListPlus, Minus, PackageOpen, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ItemFormModal } from "../components/ItemForm";
import { DemoBadge, FreshnessMeter, ItemThumb, LowStockBadge, OpenedBadge, StatusBadge } from "../components/pantry-bits";
import { StockModal, type StockMode } from "../components/StockModals";
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Spinner } from "../components/ui";
import { ApiError, del, errorMessage, get, post } from "../lib/api";
import { fmtDate, money, qty, reasonLabel, timeAgo } from "../lib/format";
import { useAction, useRefreshAll, useSettings } from "../lib/hooks";
import type { Activity, Batch, Item, UsageEvent } from "../lib/types";

export function ItemDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const refresh = useRefreshAll();
  const settings = useSettings();
  const currency = settings.data?.settings.currency ?? "INR";
  const q = useQuery({ queryKey: ["item", id], queryFn: () => get<{ item: Item; today: string }>(`/items/${id}`) });
  const history = useQuery({ queryKey: ["item-history", id], queryFn: () => get<{ usage: UsageEvent[]; activity: Activity[] }>(`/items/${id}/history`) });
  const [stock, setStock] = useState<{ mode: StockMode; batch?: Batch } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: "trash" } | { kind: "batch"; batch: Batch } | { kind: "expired" }>(null);
  const [busy, setBusy] = useState(false);

  const openBatch = useAction((b: Batch) => post(`/items/${id}/batches/${b.id}/open`, {}), { success: "Marked as opened" });

  if (q.isLoading) return <Spinner />;
  if (q.error) {
    if (q.error instanceof ApiError && q.error.status === 404)
      return (
        <EmptyState title="Item not found" action={<Link to="/pantry" className="font-semibold text-basil hover:underline">Back to pantry</Link>}>
          It may have been moved to the trash or deleted.
        </EmptyState>
      );
    return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  }
  const { item, today } = q.data!;
  document.title = `${item.name} — Smart Pantry`;
  const inStock = item.batches.filter((b) => b.quantity > 0);
  const used = item.batches.filter((b) => b.quantity <= 0);
  const hasExpired = inStock.some((b) => b.status === "EXPIRED");

  async function runConfirm() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === "trash") {
        await del(`/items/${id}`);
        toast.success(`${item.name} moved to trash`, {
          action: { label: "Undo", onClick: () => post(`/items/${id}/restore`).then(() => { refresh(); navigate(`/pantry/${id}`); }).catch((e) => toast.error(errorMessage(e))) },
        });
        refresh();
        navigate("/pantry");
      } else if (confirm.kind === "batch") {
        await del(`/items/${id}/batches/${confirm.batch.id}`);
        toast.success("Batch removed");
        refresh();
      } else {
        const r = await post<{ discarded: number }>(`/items/${id}/discard-expired`);
        toast.success(`Recorded ${r.discarded} expired batch(es) as wasted`);
        refresh();
      }
      setConfirm(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const addToList = () =>
    post("/shopping", { name: item.name, quantity: item.minStock > 0 ? item.minStock : 1, unit: item.unit, itemId: item.id })
      .then(() => toast.success(`${item.name} added to your shopping list`))
      .catch((e) => toast.error(errorMessage(e)));

  return (
    <>
      <Link to="/pantry" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        Pantry
      </Link>

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <ItemThumb name={item.name} category={item.category.name} imageId={item.imageId} size="lg" />
          <div>
            <h1 className="text-[30px] leading-tight font-[650]">
              {item.name} {item.isDemo && <DemoBadge />}
            </h1>
            <p className="text-ink-2">{[item.brand, item.category.name, item.location.name].filter(Boolean).join(" · ")}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadge status={item.status} />
              {item.lowStock && item.status !== "OUT_OF_STOCK" && <LowStockBadge />}
              {inStock.some((b) => b.openedAt) && <OpenedBadge />}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={Minus} onClick={() => setStock({ mode: "consume" })} disabled={item.quantity <= 0}>
            Record use
          </Button>
          <Button variant="secondary" icon={Plus} onClick={() => setStock({ mode: "restock" })}>
            Restock
          </Button>
          <Button variant="secondary" onClick={() => setStock({ mode: "discard" })} disabled={item.quantity <= 0}>
            Record waste
          </Button>
          <Button variant="ghost" icon={Pencil} onClick={() => setEditOpen(true)}>
            Edit
          </Button>
        </div>
      </div>

      {hasExpired && (
        <div role="alert" className="mb-5 flex flex-col gap-3 rounded-2xl border border-chilli/25 bg-chilli-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm text-ink">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-chilli" aria-hidden />
            Some of this item is past its date. Check it before eating; dates are a guide and storage conditions matter.
          </p>
          <Button size="sm" variant="danger" onClick={() => setConfirm({ kind: "expired" })}>
            Discard expired stock
          </Button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Batches" description="Each purchase keeps its own dates. Using stock takes from the earliest expiry first." />
          {inStock.length === 0 ? (
            <EmptyState title="Out of stock" action={<Button icon={Plus} onClick={() => setStock({ mode: "restock" })}>Restock</Button>}>
              Restock when you buy more, or add it to your shopping list.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {inStock.map((b) => (
                <li key={b.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_12rem]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="num font-display text-xl font-[650]">{qty(b.quantity, item.unit)}</span>
                      {b.initialQuantity > b.quantity && <span className="num text-sm text-ink-3">of {qty(b.initialQuantity, item.unit)}</span>}
                      <StatusBadge status={b.status} />
                      {b.openedAt && <OpenedBadge />}
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                      <div>
                        <dt className="text-ink-3">Bought</dt>
                        <dd>{fmtDate(b.purchaseDate)}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-3">Label date</dt>
                        <dd>{fmtDate(b.expiryDate)}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-3">Opened</dt>
                        <dd>{fmtDate(b.openedAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-3">Price</dt>
                        <dd className="num">{money(b.cost, currency)}</dd>
                      </div>
                    </dl>
                    {b.expiryReason === "OPENED" && (
                      <p className="mt-2 text-sm text-turmeric">
                        Use by {fmtDate(b.effectiveExpiry)}: opened items keep about {item.effectiveOpenedShelfLifeDays} days, earlier than the label date.
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {!b.openedAt && item.effectiveOpenedShelfLifeDays != null && (
                        <Button size="sm" variant="secondary" icon={PackageOpen} onClick={() => openBatch.mutate(b)} loading={openBatch.isPending && openBatch.variables?.id === b.id}>
                          Mark opened
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setStock({ mode: "batch", batch: b })}>
                        Edit batch
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setStock({ mode: "discard", batch: b })}>
                        Waste this batch
                      </Button>
                      <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirm({ kind: "batch", batch: b })}>
                        Remove entry
                      </Button>
                    </div>
                  </div>
                  <div className="sm:pt-1">
                    <FreshnessMeter start={b.purchaseDate} expiry={b.effectiveExpiry} today={today} status={b.status} daysLeft={b.daysLeft} noExpiry={item.noExpiry} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {used.length > 0 && <p className="border-t border-line px-5 py-3 text-sm text-ink-3">{used.length} used-up batch(es) are kept for purchase-cost history.</p>}
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Details" />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 pb-5 text-sm">
              <div>
                <dt className="text-ink-3">In stock</dt>
                <dd className="num font-semibold">{qty(item.quantity, item.unit)}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Minimum stock</dt>
                <dd className="num">{item.minStock > 0 ? qty(item.minStock, item.unit) : "Not set"}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Next expiry</dt>
                <dd>{item.noExpiry ? "No expiry" : fmtDate(item.nextExpiry)}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Keeps once opened</dt>
                <dd>{item.effectiveOpenedShelfLifeDays != null ? `${item.effectiveOpenedShelfLifeDays} days${item.openedShelfLifeDays == null ? " (category default)" : ""}` : "Not set"}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Stock value</dt>
                <dd className="num">{item.stockValue != null ? `${money(item.stockValue, currency)} (est.)` : "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Barcode</dt>
                <dd className="num">{item.barcode ?? "—"}</dd>
              </div>
              {item.notes && (
                <div className="col-span-2">
                  <dt className="text-ink-3">Notes</dt>
                  <dd className="whitespace-pre-line">{item.notes}</dd>
                </div>
              )}
            </dl>
            <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
              <Button size="sm" variant="subtle" icon={ListPlus} onClick={() => void addToList()}>
                Add to shopping list
              </Button>
              <Button size="sm" variant="ghost" icon={Trash2} className="text-chilli" onClick={() => setConfirm({ kind: "trash" })}>
                Move to trash
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="History" />
            {history.isLoading ? (
              <Spinner />
            ) : !history.data || (history.data.usage.length === 0 && history.data.activity.length === 0) ? (
              <EmptyState title="No history yet" />
            ) : (
              <ul className="max-h-96 overflow-y-auto px-5 pb-4 text-sm">
                {history.data.usage.map((u) => (
                  <li key={u.id} className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-0">
                    <span>
                      <Badge className={u.type === "WASTED" ? "bg-chilli-soft text-chilli" : "bg-basil-soft text-bay"}>{u.type === "WASTED" ? "Wasted" : "Used"}</Badge>{" "}
                      <span className="num">{qty(u.quantity, u.unit)}</span>
                      {u.reason && <span className="text-ink-2"> · {reasonLabel(u.reason)}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-ink-3">{timeAgo(u.occurredAt)}</span>
                  </li>
                ))}
                {history.data.usage.length === 0 &&
                  history.data.activity.slice(0, 10).map((a) => (
                    <li key={a.id} className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-0">
                      <span>{a.message}</span>
                      <span className="shrink-0 text-xs text-ink-3">{timeAgo(a.createdAt)}</span>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <StockModal item={stock ? item : null} mode={stock?.mode ?? null} batch={stock?.batch} onClose={() => setStock(null)} />
      <ItemFormModal open={editOpen} onClose={() => setEditOpen(false)} item={item} />
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => void runConfirm()}
        loading={busy}
        danger
        title={confirm?.kind === "trash" ? "Move to trash?" : confirm?.kind === "batch" ? "Remove this batch entry?" : "Discard expired stock?"}
        confirmLabel={confirm?.kind === "trash" ? "Move to trash" : confirm?.kind === "batch" ? "Remove entry" : "Record as wasted"}
        message={
          confirm?.kind === "trash"
            ? `${item.name} will be hidden from your pantry. You can restore it from Trash.`
            : confirm?.kind === "batch"
              ? "Use this only for an entry added by mistake. To record food that was eaten or thrown away, use Record use or Record waste so your history stays accurate."
              : "All expired batches will be recorded as wasted (reason: went past its date) and removed from stock."
        }
      />
    </>
  );
}
