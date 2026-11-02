import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Minus, MoreHorizontal, Package, PackagePlus, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { useAddItem } from "../components/Layout";
import { DemoBadge, FreshnessMeter, ItemThumb, LowStockBadge, StatusBadge } from "../components/pantry-bits";
import { StockModal, type StockMode } from "../components/StockModals";
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, PageHeader, Pagination, Select, Spinner } from "../components/ui";
import { del, errorMessage, get, post } from "../lib/api";
import { qty } from "../lib/format";
import { useCategories, useLocations, useRefreshAll } from "../lib/hooks";
import type { Item } from "../lib/types";

interface ListResponse {
  items: Item[];
  total: number;
  page: number;
  totalPages: number;
  today: string;
  warningDays: number;
}

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "ATTENTION", label: "Needs attention" },
  { value: "EXPIRED", label: "Expired" },
  { value: "EXPIRING", label: "Expiring soon" },
  { value: "SAFE", label: "Safe" },
  { value: "NO_DATE", label: "Date missing" },
  { value: "NO_EXPIRY", label: "No expiry" },
  { value: "LOW_STOCK", label: "Low stock" },
  { value: "OUT_OF_STOCK", label: "Out of stock" },
];

const SORT_OPTIONS = [
  { value: "urgency", label: "Most urgent first" },
  { value: "expiry", label: "Expiry date" },
  { value: "name", label: "Name" },
  { value: "quantity", label: "Quantity" },
  { value: "purchaseDate", label: "Purchase date" },
  { value: "createdAt", label: "Date added" },
];

function RowActions({ item, onAction, onDelete }: { item: Item; onAction: (m: StockMode) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex items-center justify-end gap-1">
      <Button size="sm" variant="subtle" icon={Minus} onClick={() => onAction("consume")} disabled={item.quantity <= 0} aria-label={`Record use of ${item.name}`}>
        Use
      </Button>
      <Button size="sm" variant="secondary" icon={Plus} onClick={() => onAction("restock")} aria-label={`Restock ${item.name}`}>
        <span className="hidden xl:inline">Restock</span>
      </Button>
      <button
        type="button"
        aria-label={`More actions for ${item.name}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={(e) => !e.currentTarget.parentElement?.contains(e.relatedTarget) && setOpen(false)}
        className="inline-flex size-8 items-center justify-center rounded-lg text-ink-2 hover:bg-oat"
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute top-9 right-0 z-20 w-44 rounded-xl border border-line bg-surface p-1 shadow-lg">
          <Link role="menuitem" to={`/pantry/${item.id}`} className="block rounded-lg px-3 py-2 text-sm hover:bg-oat">
            Open details
          </Link>
          <button role="menuitem" disabled={item.quantity <= 0} onClick={() => { setOpen(false); onAction("discard"); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-oat disabled:opacity-40">
            Record waste
          </button>
          <button role="menuitem" onClick={() => { setOpen(false); onDelete(); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-chilli hover:bg-chilli-soft">
            Move to trash
          </button>
        </div>
      )}
    </div>
  );
}

export function PantryPage() {
  const [params, setParams] = useSearchParams();
  const openAdd = useAddItem();
  const refresh = useRefreshAll();
  const categories = useCategories();
  const locations = useLocations();
  const [searchInput, setSearchInput] = useState(params.get("search") ?? "");
  const [stock, setStock] = useState<{ item: Item; mode: StockMode } | null>(null);
  const [toDelete, setToDelete] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filters = {
    search: params.get("search") ?? "",
    categoryId: params.get("categoryId") ?? "",
    locationId: params.get("locationId") ?? "",
    status: params.get("status") ?? "",
    sort: params.get("sort") ?? "urgency",
    order: params.get("order") ?? "asc",
    page: Number(params.get("page") ?? 1),
  };

  const update = (patch: Record<string, string | number>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === "" || v == null) next.delete(k);
      else next.set(k, String(v));
    }
    if (!("page" in patch)) next.delete("page"); // any filter change returns to page 1
    setParams(next, { replace: true });
  };

  // Debounced search so typing doesn't fire a request per keystroke
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== filters.search) update({ search: searchInput.trim() });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const q = useQuery({
    queryKey: ["items", filters],
    queryFn: () => get<ListResponse>("/items", { ...filters, pageSize: 15 }),
    placeholderData: keepPreviousData,
  });

  // Deleting the last item on the last page would otherwise show an empty page
  useEffect(() => {
    if (q.data && q.data.total > 0 && q.data.items.length === 0 && filters.page > 1) update({ page: q.data.totalPages });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const hasFilters = Boolean(filters.search || filters.categoryId || filters.locationId || filters.status);

  async function moveToTrash() {
    if (!toDelete) return;
    const item = toDelete;
    setDeleting(true);
    try {
      await del(`/items/${item.id}`);
      refresh();
      setToDelete(null);
      toast.success(`${item.name} moved to trash`, {
        action: {
          label: "Undo",
          onClick: () =>
            post(`/items/${item.id}/restore`)
              .then(() => {
                refresh();
                toast.success(`${item.name} restored`);
              })
              .catch((e) => toast.error(errorMessage(e))),
        },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Pantry"
        description="Everything you have, with the most urgent items first."
        actions={
          <Button icon={PackagePlus} onClick={() => openAdd()}>
            Add item
          </Button>
        }
      />

      <Card className="mb-4 p-3">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1fr_1.35fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input aria-label="Search by name, brand or barcode" placeholder="Search name, brand or barcode" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="pl-9" />
          </div>
          <Select aria-label="Filter by status" value={filters.status} onChange={(e) => update({ status: e.target.value })}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Select aria-label="Filter by category" value={filters.categoryId} onChange={(e) => update({ categoryId: e.target.value })}>
            <option value="">All categories</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Filter by storage location" value={filters.locationId} onChange={(e) => update({ locationId: e.target.value })}>
            <option value="">All locations</option>
            {locations.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Select aria-label="Sort by" value={filters.sort} onChange={(e) => update({ sort: e.target.value })}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Button variant="secondary" className="px-3" aria-label={filters.order === "asc" ? "Ascending order, switch to descending" : "Descending order, switch to ascending"} onClick={() => update({ order: filters.order === "asc" ? "desc" : "asc" })}>
              {filters.order === "asc" ? "↑" : "↓"}
            </Button>
          </div>
        </div>
        {hasFilters && (
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-ink-2" role="status">
              {q.data ? `${q.data.total} matching item${q.data.total === 1 ? "" : "s"}` : "Filtering…"}
            </span>
            <Button
              size="sm"
              variant="ghost"
              icon={X}
              onClick={() => {
                setSearchInput("");
                setParams({}, { replace: true });
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </Card>

      <Card>
        {q.isLoading ? (
          <Spinner />
        ) : q.error ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        ) : q.data!.items.length === 0 ? (
          hasFilters ? (
            <EmptyState icon={Search} title="No items match these filters" action={<Button variant="secondary" onClick={() => { setSearchInput(""); setParams({}, { replace: true }); }}>Clear filters</Button>}>
              Try a different search or status.
            </EmptyState>
          ) : (
            <EmptyState icon={Package} title="Your pantry is empty" action={<Button icon={PackagePlus} onClick={() => openAdd()}>Add your first item</Button>}>
              Add items with their expiry dates to start tracking.
            </EmptyState>
          )
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-[15px]">
                <caption className="sr-only">Pantry items</caption>
                <thead>
                  <tr className="border-b border-line text-left text-sm text-ink-2">
                    <th scope="col" className="px-5 py-3 font-semibold">Item</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Quantity</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Freshness</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className={q.isFetching ? "opacity-70" : ""}>
                  {q.data!.items.map((i) => {
                    return (
                      <tr key={i.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <ItemThumb name={i.name} category={i.category.name} imageId={i.imageId} />
                            <div className="min-w-0">
                              <Link to={`/pantry/${i.id}`} className="font-semibold hover:underline">
                                {i.name}
                              </Link>{" "}
                              {i.isDemo && <DemoBadge />}
                              <p className="truncate text-sm text-ink-2">
                                {[i.brand, i.category.name, i.location.name].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="num px-3 py-3 whitespace-nowrap">
                          {qty(i.quantity, i.unit)}
                          {i.batches.filter((b) => b.quantity > 0).length > 1 && <span className="block text-xs text-ink-3">{i.batches.filter((b) => b.quantity > 0).length} batches</span>}
                        </td>
                        <td className="px-3 py-3">
                          <FreshnessMeter start={i.nextStart} expiry={i.nextExpiry} today={q.data!.today} status={i.status} daysLeft={i.daysLeft} noExpiry={i.noExpiry} compact />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge status={i.status} />
                            {i.lowStock && i.status !== "OUT_OF_STOCK" && <LowStockBadge />}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <RowActions item={i} onAction={(mode) => setStock({ item: i, mode })} onDelete={() => setToDelete(i)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-line md:hidden">
              {q.data!.items.map((i) => (
                <li key={i.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <ItemThumb name={i.name} category={i.category.name} imageId={i.imageId} />
                    <div className="min-w-0 flex-1">
                      <Link to={`/pantry/${i.id}`} className="font-semibold">
                        {i.name}
                      </Link>{" "}
                      {i.isDemo && <DemoBadge />}
                      <p className="num text-sm text-ink-2">
                        {qty(i.quantity, i.unit)} · {i.location.name}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <StatusBadge status={i.status} />
                        {i.lowStock && i.status !== "OUT_OF_STOCK" && <LowStockBadge />}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <FreshnessMeter start={i.nextStart} expiry={i.nextExpiry} today={q.data!.today} status={i.status} daysLeft={i.daysLeft} noExpiry={i.noExpiry} compact />
                    <div className="flex gap-1">
                      <Button size="sm" variant="subtle" onClick={() => setStock({ item: i, mode: "consume" })} disabled={i.quantity <= 0} aria-label={`Record use of ${i.name}`}>
                        Use
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setStock({ item: i, mode: "restock" })} aria-label={`Restock ${i.name}`}>
                        Restock
                      </Button>
                      <button aria-label={`Move ${i.name} to trash`} onClick={() => setToDelete(i)} className="inline-flex size-8 items-center justify-center rounded-lg text-ink-2 hover:bg-chilli-soft hover:text-chilli">
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={q.data!.page} totalPages={q.data!.totalPages} onPage={(p) => update({ page: p })} />
          </>
        )}
      </Card>

      <StockModal item={stock?.item ?? null} mode={stock?.mode ?? null} onClose={() => setStock(null)} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={() => void moveToTrash()}
        loading={deleting}
        danger
        title="Move to trash?"
        confirmLabel="Move to trash"
        message={
          <>
            <strong className="text-ink">{toDelete?.name}</strong> will be removed from your pantry. You can restore it from Trash. Its usage history is kept.
          </>
        }
      />
    </>
  );
}
