import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ApiError, errorMessage, patch, post } from "../lib/api";
import { compatibleUnits, fmtDate, qty, todayLocal, WASTE_REASONS } from "../lib/format";
import { useRefreshAll } from "../lib/hooks";
import type { Batch, Item } from "../lib/types";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";

export type StockMode = "consume" | "discard" | "restock" | "batch";

const TITLES: Record<StockMode, string> = {
  consume: "Record use",
  discard: "Record waste",
  restock: "Restock",
  batch: "Edit batch",
};

export function StockModal({ item, mode, batch, onClose }: { item: Item | null; mode: StockMode | null; batch?: Batch | null; onClose: () => void }) {
  const refresh = useRefreshAll();
  const open = Boolean(item && mode);
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [reason, setReason] = useState("EXPIRED");
  const [note, setNote] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayLocal());
  const [expiryDate, setExpiryDate] = useState("");
  const [openedAt, setOpenedAt] = useState("");
  const [cost, setCost] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [expiredPrompt, setExpiredPrompt] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !item) return;
    setErrors({});
    setExpiredPrompt(null);
    setNote("");
    setUnit(item.unit);
    setReason(batch?.status === "EXPIRED" || item.status === "EXPIRED" ? "EXPIRED" : "SPOILED");
    if (mode === "batch" && batch) {
      setQuantity(String(batch.quantity));
      setPurchaseDate(batch.purchaseDate ?? "");
      setExpiryDate(batch.expiryDate ?? "");
      setOpenedAt(batch.openedAt ?? "");
      setCost(batch.cost == null ? "" : String(batch.cost));
    } else if (mode === "discard" && batch) {
      setQuantity(String(batch.quantity));
    } else {
      setQuantity(mode === "restock" ? String(item.minStock > 0 ? item.minStock : 1) : "");
      setPurchaseDate(todayLocal());
      setExpiryDate("");
      setCost("");
    }
  }, [open, item, mode, batch]);

  if (!item || !mode) return null;

  const validate = () => {
    const e: Record<string, string> = {};
    const q = Number(quantity);
    if (quantity === "" || Number.isNaN(q) || (mode === "batch" ? q < 0 : q <= 0)) e.quantity = mode === "batch" ? "Enter 0 or more" : "Enter a quantity greater than 0";
    if (mode === "restock" || mode === "batch") {
      if (!item.noExpiry && !expiryDate) e.expiryDate = "Enter the expiry date from the label";
      if (purchaseDate && purchaseDate > todayLocal()) e.purchaseDate = "Can't be in the future";
      if (purchaseDate && expiryDate && expiryDate < purchaseDate) e.expiryDate = "Can't be before the purchase date";
      if (cost !== "" && Number(cost) < 0) e.cost = "Can't be negative";
    }
    if (mode === "batch" && openedAt && openedAt > todayLocal()) e.openedAt = "Can't be in the future";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  async function send(allowExpired = false) {
    const id = item!.id;
    if (mode === "consume") {
      await post(`/items/${id}/consume`, { quantity: Number(quantity), unit, note: note || null, allowExpired, batchId: batch?.id });
      toast.success(`Recorded ${quantity} ${unit} of ${item!.name} as used`);
    } else if (mode === "discard") {
      await post(`/items/${id}/discard`, { quantity: Number(quantity), unit, reason, note: note || null, batchId: batch?.id });
      toast.success(`Recorded ${quantity} ${unit} of ${item!.name} as wasted`);
    } else if (mode === "restock") {
      await post(`/items/${id}/batches`, { quantity: Number(quantity), purchaseDate: purchaseDate || null, expiryDate: item!.noExpiry ? null : expiryDate, cost: cost === "" ? null : Number(cost) });
      toast.success(`Restocked ${item!.name}`);
    } else if (mode === "batch" && batch) {
      await patch(`/items/${id}/batches/${batch.id}`, { quantity: Number(quantity), purchaseDate: purchaseDate || null, expiryDate: expiryDate || null, openedAt: openedAt || null, cost: cost === "" ? null : Number(cost) });
      toast.success("Batch updated");
    }
  }

  async function submit(e?: FormEvent, allowExpired = false) {
    e?.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await send(allowExpired);
      refresh();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "EXPIRED_STOCK") setExpiredPrompt(err.message);
      else if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const units = compatibleUnits(item.unit);
  const available = batch ? batch.quantity : item.quantity;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={`${TITLES[mode]}: ${item.name}`}
      description={
        mode === "consume" || mode === "discard"
          ? `${qty(available, item.unit)} available${batch ? ` in this batch (expiry ${fmtDate(batch.effectiveExpiry)})` : ""}. Stock is taken from the batch that expires first.`
          : mode === "restock"
            ? "Adds a new batch with its own expiry date."
            : "Correct a mistake in this batch. Changes are recorded in the activity log."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="stock-form" loading={saving} variant={mode === "discard" ? "danger" : "primary"}>
            {mode === "consume" ? "Record use" : mode === "discard" ? "Record waste" : mode === "restock" ? "Add stock" : "Save batch"}
          </Button>
        </>
      }
    >
      <form id="stock-form" noValidate onSubmit={(e) => void submit(e)} className="grid gap-4">
        {expiredPrompt && (
          <div role="alert" className="rounded-xl border border-chilli/30 bg-chilli-soft p-3 text-sm">
            <p className="font-semibold text-chilli">{expiredPrompt}</p>
            <p className="mt-1 text-ink-2">Only record it as used if you checked the food and it was fine to eat.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  setSaving(true);
                  try {
                    await post(`/items/${item.id}/discard`, { quantity: Number(quantity), unit, reason: "EXPIRED" });
                    toast.success("Recorded as wasted");
                    refresh();
                    onClose();
                  } catch (err) {
                    toast.error(errorMessage(err));
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Record as wasted
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void submit(undefined, true)}>
                I checked it, record as used
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Quantity" required error={errors.quantity}>
            {(id, d) => <Input id={id} aria-describedby={d} type="number" inputMode="decimal" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} invalid={!!errors.quantity} />}
          </Field>
          <Field label="Unit">
            {(id) =>
              mode === "consume" || mode === "discard" ? (
                <Select id={id} value={unit} onChange={(e) => setUnit(e.target.value)} className="w-28">
                  {units.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.value}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input id={id} value={item.unit} disabled className="w-28" />
              )
            }
          </Field>
        </div>

        {(mode === "consume" || mode === "discard") && available > 0 && (
          <div className="-mt-2 flex flex-wrap gap-1.5">
            {[0.25, 0.5, 1].map((f) => (
              <button key={f} type="button" onClick={() => { setUnit(item.unit); setQuantity(String(Number((available * f).toFixed(3)))); }} className="rounded-full border border-line-strong px-2.5 py-0.5 text-xs font-semibold text-ink-2 hover:bg-oat">
                {f === 1 ? "All" : f === 0.5 ? "Half" : "Quarter"}
              </button>
            ))}
          </div>
        )}

        {mode === "discard" && (
          <Field label="Why was it thrown away?" required>
            {(id) => (
              <Select id={id} value={reason} onChange={(e) => setReason(e.target.value)}>
                {WASTE_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        {(mode === "restock" || mode === "batch") && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Purchase date" error={errors.purchaseDate}>
              {(id, d) => <Input id={id} aria-describedby={d} type="date" max={todayLocal()} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} invalid={!!errors.purchaseDate} />}
            </Field>
            <Field label="Expiry date" required={!item.noExpiry} error={errors.expiryDate}>
              {(id, d) => <Input id={id} aria-describedby={d} type="date" value={expiryDate} disabled={item.noExpiry} onChange={(e) => setExpiryDate(e.target.value)} invalid={!!errors.expiryDate} />}
            </Field>
            {mode === "batch" && (
              <Field label="Opened on" error={errors.openedAt} hint="Leave empty if still sealed">
                {(id, d) => <Input id={id} aria-describedby={d} type="date" max={todayLocal()} value={openedAt} onChange={(e) => setOpenedAt(e.target.value)} />}
              </Field>
            )}
            <Field label="Price paid (optional)" error={errors.cost}>
              {(id, d) => <Input id={id} aria-describedby={d} type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />}
            </Field>
          </div>
        )}

        {(mode === "consume" || mode === "discard") && (
          <Field label="Note (optional)">{(id) => <Textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="min-h-14" />}</Field>
        )}
      </form>
    </Modal>
  );
}
