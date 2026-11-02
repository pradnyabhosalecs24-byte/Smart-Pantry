import { useQuery } from "@tanstack/react-query";
import { Check, Download, ListPlus, Plus, RotateCcw, ShoppingCart, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Field, IconButton, Input, Modal, PageHeader, Select, Spinner } from "../components/ui";
import { ApiError, apiUrl, del, errorMessage, get, patch, post } from "../lib/api";
import { qty, todayLocal, UNITS } from "../lib/format";
import { useAction, useCategories, useLocations, useRefreshAll } from "../lib/hooks";
import type { ShoppingEntry } from "../lib/types";

function AddForm() {
  const refresh = useRefreshAll();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("pcs");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dup, setDup] = useState<{ message: string; canMerge: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e?: FormEvent, merge = false) {
    e?.preventDefault();
    const v: Record<string, string> = {};
    if (!name.trim()) v.name = "Enter a product name";
    if (!(Number(quantity) > 0)) v.quantity = "Enter more than 0";
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      const r = await post<{ merged?: boolean }>("/shopping", { name: name.trim(), quantity: Number(quantity), unit, merge });
      toast.success(r.merged ? "Quantity added to the existing entry" : `${name.trim()} added to your list`);
      setName("");
      setQuantity("1");
      setDup(null);
      refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === "DUPLICATE_ENTRY") setDup({ message: err.message, canMerge: Boolean(err.details?.canMerge) });
      else if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="grid gap-3 p-5 pt-0 sm:grid-cols-[1fr_7rem_8rem_auto] sm:items-start">
      <Field label="Product" error={errors.name}>
        {(id, d) => <Input id={id} aria-describedby={d} value={name} onChange={(e) => { setName(e.target.value); setDup(null); }} invalid={!!errors.name} placeholder="e.g. Butter" maxLength={100} />}
      </Field>
      <Field label="Quantity" error={errors.quantity}>
        {(id, d) => <Input id={id} aria-describedby={d} type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} invalid={!!errors.quantity} />}
      </Field>
      <Field label="Unit">
        {(id) => (
          <Select id={id} value={unit} onChange={(e) => setUnit(e.target.value)}>
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.value}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Button type="submit" icon={Plus} loading={busy} className="sm:mt-[26px]">
        Add
      </Button>
      {dup && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg bg-turmeric-soft px-3 py-2 text-sm sm:col-span-4">
          <span className="flex-1">{dup.message}</span>
          {dup.canMerge && (
            <Button size="sm" onClick={() => void submit(undefined, true)}>
              Add to that entry
            </Button>
          )}
        </div>
      )}
    </form>
  );
}

function PurchaseModal({ entry, onClose }: { entry: ShoppingEntry | null; onClose: () => void }) {
  const refresh = useRefreshAll();
  const categories = useCategories();
  const locations = useLocations();
  const [form, setForm] = useState({ quantity: "", expiryDate: "", noExpiry: false, cost: "", categoryId: "", locationId: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);

  if (entry && entry.id !== lastId) {
    setLastId(entry.id);
    setForm({ quantity: String(entry.quantity), expiryDate: "", noExpiry: false, cost: "", categoryId: categories.data?.find((c) => c.name === "Other")?.id ?? "", locationId: locations.data?.find((l) => l.name === "Pantry Shelf")?.id ?? "" });
    setErrors({});
  }
  if (!entry) return null;

  async function save(addToPantry: boolean) {
    setBusy(true);
    try {
      await post(`/shopping/${entry!.id}/purchase`, addToPantry
        ? { addToPantry: true, quantity: Number(form.quantity), expiryDate: form.noExpiry ? null : form.expiryDate || null, noExpiry: form.noExpiry, cost: form.cost === "" ? null : Number(form.cost), categoryId: form.categoryId || undefined, locationId: form.locationId || undefined, purchaseDate: todayLocal() }
        : { addToPantry: false });
      toast.success(addToPantry ? `${entry!.name} added to your pantry` : `${entry!.name} marked as bought`);
      refresh();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
      else toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Bought ${entry.name}`}
      description="Add it to your pantry now so its expiry date is tracked."
      footer={
        <>
          <Button variant="ghost" onClick={() => void save(false)} disabled={busy}>
            Just mark as bought
          </Button>
          <Button onClick={() => void save(true)} loading={busy}>
            Add to pantry
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label={`Quantity (${entry.unit})`} error={errors.quantity}>
          {(id, d) => <Input id={id} aria-describedby={d} type="number" min="0" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />}
        </Field>
        <Field label="Expiry date" required={!form.noExpiry} error={errors.expiryDate}>
          {(id, d) => <Input id={id} aria-describedby={d} type="date" disabled={form.noExpiry} value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} invalid={!!errors.expiryDate} />}
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--basil)]" checked={form.noExpiry} onChange={(e) => setForm({ ...form, noExpiry: e.target.checked })} />
          This product has no expiry date
        </label>
        <Field label="Price paid (optional)">{(id) => <Input id={id} type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />}</Field>
        {!entry.itemId && (
          <>
            <p className="text-sm text-ink-2">If this is new to your pantry, choose where it belongs. An existing item with the same name is restocked instead.</p>
            <Field label="Category" error={errors.categoryId}>
              {(id) => (
                <Select id={id} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  {categories.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Stored in" error={errors.locationId}>
              {(id) => (
                <Select id={id} value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                  {locations.data?.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}

export function ShoppingPage() {
  const q = useQuery({ queryKey: ["shopping"], queryFn: () => get<{ pending: ShoppingEntry[]; purchased: ShoppingEntry[] }>("/shopping") });
  const [buying, setBuying] = useState<ShoppingEntry | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const fromLow = useAction(() => post<{ added: number }>("/shopping/from-low-stock"), { success: (r) => (r.added ? `Added ${r.added} low-stock item(s)` : "No new low-stock items to add") });
  const remove = useAction((e: ShoppingEntry) => del(`/shopping/${e.id}`), { success: (_r, e) => `${e.name} removed` });
  const reopen = useAction((e: ShoppingEntry) => patch(`/shopping/${e.id}`, { status: "PENDING" }), { success: "Moved back to the list" });
  const changeQty = useAction((v: { e: ShoppingEntry; quantity: number }) => patch(`/shopping/${v.e.id}`, { quantity: v.quantity }), {});
  const clearBought = useAction(() => del<{ removed: number }>("/shopping/purchased"), { success: (r) => `Cleared ${r.removed} bought item(s)`, onSuccess: () => setClearOpen(false) });

  return (
    <>
      <PageHeader
        title="Shopping list"
        description="Plan what to buy. Ticking an item off can add it straight to your pantry."
        actions={
          <>
            <Button variant="secondary" icon={ListPlus} onClick={() => fromLow.mutate()} loading={fromLow.isPending}>
              Add low-stock items
            </Button>
            <a href={apiUrl("/data/export/shopping.csv")} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-[15px] font-semibold hover:bg-surface-2">
              <Download className="size-4" aria-hidden />
              Export
            </a>
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="To buy" description={q.data ? `${q.data.pending.length} item(s)` : undefined} />
          <AddForm />
          {q.isLoading ? (
            <Spinner />
          ) : q.error ? (
            <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
          ) : q.data!.pending.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="Your list is empty">
              Add products above, or pull in everything that's running low.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {q.data!.pending.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                  <button
                    aria-label={`Mark ${e.name} as bought`}
                    onClick={() => setBuying(e)}
                    className="flex size-6 shrink-0 items-center justify-center rounded-md border-2 border-line-strong text-transparent hover:border-basil hover:text-basil"
                  >
                    <Check className="size-4" aria-hidden />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{e.name}</p>
                    {e.note && <p className="text-xs text-ink-3">{e.note}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      aria-label={`Quantity of ${e.name}`}
                      type="number"
                      min="0"
                      step="any"
                      defaultValue={e.quantity}
                      className="h-8 w-20 text-right num"
                      onBlur={(ev) => {
                        const v = Number(ev.target.value);
                        if (v > 0 && v !== e.quantity) changeQty.mutate({ e, quantity: v });
                        else ev.target.value = String(e.quantity);
                      }}
                    />
                    <span className="w-10 text-sm text-ink-2">{e.unit}</span>
                  </div>
                  <IconButton icon={Trash2} label={`Remove ${e.name}`} onClick={() => remove.mutate(e)} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Bought"
            action={
              q.data && q.data.purchased.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setClearOpen(true)}>
                  Clear
                </Button>
              )
            }
          />
          {!q.data || q.data.purchased.length === 0 ? (
            <EmptyState title="Nothing bought yet">Items you tick off appear here.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {q.data.purchased.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <Check className="size-4 text-basil" aria-hidden />
                  <span className="flex-1 text-ink-2 line-through decoration-line-strong">
                    {e.name} <span className="num">({qty(e.quantity, e.unit)})</span>
                  </span>
                  {e.addedToPantry ? (
                    <span className="text-xs font-semibold text-basil">In pantry</span>
                  ) : (
                    <IconButton icon={RotateCcw} label={`Move ${e.name} back to the list`} onClick={() => reopen.mutate(e)} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <PurchaseModal entry={buying} onClose={() => setBuying(null)} />
      <ConfirmDialog open={clearOpen} onClose={() => setClearOpen(false)} onConfirm={() => clearBought.mutate()} loading={clearBought.isPending} title="Clear bought items?" message="This removes the bought list. Your pantry is not affected." confirmLabel="Clear list" />
    </>
  );
}
