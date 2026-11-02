import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Mic, MicOff, ScanBarcode, Search, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { api, ApiError, apiUrl, errorMessage, get, patch, post } from "../lib/api";
import { todayLocal, UNITS } from "../lib/format";
import { useCategories, useLocations, useRefreshAll } from "../lib/hooks";
import { resizeImage } from "../lib/image";
import { guessPlacement, parseQuickAdd } from "../lib/quickAdd";
import type { Item } from "../lib/types";
import { BarcodeScanner } from "./BarcodeScanner";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";

export interface ItemPrefill {
  name?: string;
  brand?: string;
  barcode?: string;
  unit?: string;
  categoryId?: string;
}

interface FormState {
  name: string;
  brand: string;
  categoryId: string;
  locationId: string;
  quantity: string;
  unit: string;
  purchaseDate: string;
  expiryDate: string;
  noExpiry: boolean;
  minStock: string;
  cost: string;
  openedShelfLifeDays: string;
  barcode: string;
  notes: string;
  imageId: string | null;
}

const blank = (): FormState => ({
  name: "",
  brand: "",
  categoryId: "",
  locationId: "",
  quantity: "1",
  unit: "pcs",
  purchaseDate: todayLocal(),
  expiryDate: "",
  noExpiry: false,
  minStock: "0",
  cost: "",
  openedShelfLifeDays: "",
  barcode: "",
  notes: "",
  imageId: null,
});

function validate(f: FormState, editing: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.name.trim()) e.name = "Item name is required";
  if (!f.categoryId) e.categoryId = "Choose a category";
  if (!f.locationId) e.locationId = "Choose where it's stored";
  if (f.minStock !== "" && (Number.isNaN(Number(f.minStock)) || Number(f.minStock) < 0)) e.minStock = "Minimum stock can't be negative";
  if (f.barcode && !/^\d{6,14}$/.test(f.barcode)) e.barcode = "Barcode must be 6–14 digits";
  if (editing) return e;
  const q = Number(f.quantity);
  if (!f.quantity || Number.isNaN(q) || q <= 0) e.quantity = "Enter a quantity greater than 0";
  if (!f.noExpiry && !f.expiryDate) e.expiryDate = "Enter the expiry date from the label, or tick “No expiry date”";
  if (f.purchaseDate && f.purchaseDate > todayLocal()) e.purchaseDate = "Purchase date can't be in the future";
  if (f.purchaseDate && f.expiryDate && f.expiryDate < f.purchaseDate) e.expiryDate = "Expiry can't be before the purchase date";
  if (f.cost !== "" && (Number.isNaN(Number(f.cost)) || Number(f.cost) < 0)) e.cost = "Cost can't be negative";
  return e;
}

/** Add a new item, or edit an existing item's details (stock & dates are edited per batch). */
// Browser speech recognition (Chrome, Edge, Safari). Typed quick add works everywhere.
type Recognition = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onerror: (e: { error: string }) => void; onend: () => void; start: () => void; stop: () => void };
const SpeechRecognitionCtor = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

export function ItemFormModal({ open, onClose, prefill, item }: { open: boolean; onClose: () => void; prefill?: ItemPrefill; item?: Item }) {
  const editing = Boolean(item);
  const categories = useCategories();
  const locations = useLocations();
  const refresh = useRefreshAll();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [f, setF] = useState<FormState>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [lookup, setLookup] = useState<{ busy: boolean; message?: string; tone?: "ok" | "warn" }>({ busy: false });
  const [uploading, setUploading] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [quick, setQuick] = useState("");
  const [quickNote, setQuickNote] = useState<string | null>(null);
  const [listening, setListening] = useState<Recognition | null>(null);

  function applyQuick(text: string) {
    const r = parseQuickAdd(text, todayLocal());
    if (!r.name && r.quantity == null) {
      setQuickNote("Couldn't read that. Try “2 kg potatoes expiring Friday”.");
      return;
    }
    const place = guessPlacement(r.name);
    const cat = place && categories.data?.find((c) => c.name === place.category);
    const loc = place && locations.data?.find((l) => l.name === place.location);
    setF((s) => ({
      ...s,
      name: r.name || s.name,
      quantity: r.quantity != null ? String(r.quantity) : s.quantity,
      unit: r.unit ?? s.unit,
      expiryDate: r.expiryDate ?? s.expiryDate,
      categoryId: cat?.id ?? s.categoryId,
      locationId: loc?.id ?? s.locationId,
    }));
    setErrors({});
    const filled = [r.name && "name", r.quantity != null && "quantity", r.expiryDate && "expiry date", cat && "category"].filter(Boolean);
    setQuickNote(`Filled in ${filled.join(", ")}. Check the details below${r.expiryDate ? "" : " and add the expiry date"}.`);
  }

  function listen() {
    if (!SpeechRecognitionCtor) return;
    if (listening) {
      listening.stop();
      return;
    }
    const rec = new SpeechRecognitionCtor();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const said = e.results[0][0].transcript;
      setQuick(said);
      applyQuick(said);
    };
    rec.onerror = (e) => setQuickNote(e.error === "not-allowed" ? "Microphone permission was denied. You can type instead." : "Didn't catch that. Try again or type it.");
    rec.onend = () => setListening(null);
    setQuickNote("Listening… say something like “2 kg potatoes expiring Friday”.");
    setListening(rec);
    rec.start();
  }

  // Reset whenever the dialog opens
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setDuplicate(null);
    setLookup({ busy: false });
    setQuick("");
    setQuickNote(null);
    if (item) {
      setF({
        ...blank(),
        name: item.name,
        brand: item.brand ?? "",
        categoryId: item.category.id,
        locationId: item.location.id,
        unit: item.unit,
        noExpiry: item.noExpiry,
        minStock: String(item.minStock),
        openedShelfLifeDays: item.openedShelfLifeDays == null ? "" : String(item.openedShelfLifeDays),
        barcode: item.barcode ?? "",
        notes: item.notes ?? "",
        imageId: item.imageId,
      });
      setShowMore(true);
    } else {
      setF({ ...blank(), ...Object.fromEntries(Object.entries(prefill ?? {}).filter(([, v]) => v)) });
      setShowMore(Boolean(prefill?.barcode));
    }
  }, [open, item, prefill]);

  // Sensible defaults once categories/locations load
  useEffect(() => {
    if (!open || editing) return;
    setF((s) => ({
      ...s,
      categoryId: s.categoryId || categories.data?.find((c) => c.name === "Other")?.id || categories.data?.[0]?.id || "",
      locationId: s.locationId || locations.data?.find((l) => l.name === "Pantry Shelf")?.id || locations.data?.[0]?.id || "",
    }));
  }, [open, editing, categories.data, locations.data]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((s) => ({ ...s, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: "" }));
  };

  const lookUpBarcode = useCallback(async (code: string) => {
    if (!/^\d{6,14}$/.test(code)) {
      setErrors((e) => ({ ...e, barcode: "Barcode must be 6–14 digits" }));
      return;
    }
    setLookup({ busy: true });
    try {
      const r = await get<{ found: boolean; source: string; name?: string; brand?: string | null; itemId?: string; message?: string; packageSize?: string | null }>(`/barcode/${code}`);
      if (!r.found) {
        setLookup({ busy: false, message: r.message ?? "Product not found. Enter the details manually.", tone: "warn" });
        return;
      }
      if (r.source === "pantry" && r.itemId) {
        setLookup({ busy: false, message: `This barcode belongs to “${r.name}” already in your pantry. Open it to restock instead.`, tone: "warn" });
        setDuplicate({ id: r.itemId, name: r.name! });
        return;
      }
      setF((s) => ({ ...s, name: s.name || r.name || "", brand: s.brand || r.brand || "" }));
      setLookup({ busy: false, message: `Found: ${r.name}${r.brand ? ` (${r.brand})` : ""}${r.packageSize ? `, ${r.packageSize}` : ""}. Check the details before saving.`, tone: "ok" });
    } catch (e) {
      setLookup({ busy: false, message: errorMessage(e), tone: "warn" });
    }
  }, []);

  const onDetected = useCallback(
    (code: string) => {
      setScanOpen(false);
      setF((s) => ({ ...s, barcode: code }));
      setShowMore(true);
      void lookUpBarcode(code);
    },
    [lookUpBarcode],
  );

  async function onImage(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const blob = await resizeImage(file);
      const form = new FormData();
      form.append("image", blob, "photo.jpg");
      const r = await api<{ imageId: string }>("/images", { method: "POST", form });
      set("imageId", r.imageId);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  async function submit(e?: FormEvent, duplicateStrategy?: "merge" | "separate") {
    e?.preventDefault();
    const v = validate(f, editing);
    if (Object.values(v).some(Boolean)) {
      setErrors(v);
      return;
    }
    setSaving(true);
    const details = {
      name: f.name.trim(),
      brand: f.brand.trim() || null,
      categoryId: f.categoryId,
      locationId: f.locationId,
      unit: f.unit,
      minStock: Number(f.minStock || 0),
      noExpiry: f.noExpiry,
      openedShelfLifeDays: f.openedShelfLifeDays === "" ? null : Number(f.openedShelfLifeDays),
      barcode: f.barcode || null,
      notes: f.notes.trim() || null,
      imageId: f.imageId,
    };
    try {
      if (item) {
        await patch(`/items/${item.id}`, { ...details, version: item.version });
        toast.success("Changes saved");
      } else {
        const r = await post<{ item: Item; merged?: boolean }>("/items", {
          ...details,
          quantity: Number(f.quantity),
          purchaseDate: f.purchaseDate || null,
          expiryDate: f.noExpiry ? null : f.expiryDate,
          cost: f.cost === "" ? null : Number(f.cost),
          duplicateStrategy,
        });
        toast.success(r.merged ? `Added a new batch to ${r.item.name}` : `${r.item.name} added to your pantry`);
      }
      refresh();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "DUPLICATE_ITEM" && err.details?.existingItemId) {
        setDuplicate({ id: String(err.details.existingItemId), name: String(err.details.existingName) });
      } else if (err instanceof ApiError && err.code === "VERSION_CONFLICT") {
        toast.error(err.message);
        await qc.invalidateQueries({ queryKey: ["item", item?.id] });
        onClose();
      } else if (err instanceof ApiError && Object.keys(err.fields).length) {
        setErrors(err.fields);
      } else {
        toast.error(errorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  const err = (k: string) => errors[k] || undefined;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        title={editing ? `Edit ${item!.name}` : "Add an item"}
        description={editing ? "Change the item's details. Quantities and dates are edited per batch on the item page." : "Record what you bought. Fields marked * are required."}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="item-form" loading={saving}>
              {editing ? "Save changes" : "Add to pantry"}
            </Button>
          </>
        }
      >
        <form id="item-form" noValidate onSubmit={(e) => void submit(e)} className="grid gap-4 sm:grid-cols-2">
          {duplicate && !editing && (
            <div role="alert" className="rounded-xl border border-turmeric/40 bg-turmeric-soft p-3 text-sm sm:col-span-2">
              <p className="font-semibold text-ink">“{duplicate.name}” is already in your pantry.</p>
              <p className="mt-0.5 text-ink-2">Add this purchase as a new batch of that item (recommended), or keep it as a separate item.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void submit(undefined, "merge")} loading={saving}>
                  Add as new batch
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void submit(undefined, "separate")}>
                  Keep separate
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onClose();
                    navigate(`/pantry/${duplicate.id}`);
                  }}
                >
                  Open existing item
                </Button>
              </div>
            </div>
          )}

          {!editing && (
            <div className="rounded-xl border border-dashed border-line-strong bg-surface-2 p-3 sm:col-span-2">
              <label htmlFor="quick-add" className="flex items-center gap-1.5 text-sm font-semibold">
                <Sparkles className="size-4 text-basil" aria-hidden />
                Quick add: type or say it
              </label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  id="quick-add"
                  value={quick}
                  onChange={(e) => setQuick(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyQuick(quick);
                    }
                  }}
                  placeholder="e.g. 2 kg potatoes expiring Friday"
                />
                <Button variant="secondary" onClick={() => applyQuick(quick)} disabled={!quick.trim()}>
                  Fill
                </Button>
                {SpeechRecognitionCtor && (
                  <Button variant={listening ? "danger" : "secondary"} icon={listening ? MicOff : Mic} onClick={listen} aria-label={listening ? "Stop listening" : "Speak instead"} title={listening ? "Stop listening" : "Speak instead"} />
                )}
              </div>
              {quickNote && (
                <p role="status" className="mt-1.5 text-sm text-ink-2">
                  {quickNote}
                </p>
              )}
            </div>
          )}

          <Field label="Item name" required error={err("name")} className="sm:col-span-2">
            {(id, d) => <Input id={id} aria-describedby={d} value={f.name} onChange={(e) => set("name", e.target.value)} invalid={!!err("name")} placeholder="e.g. Toned milk" maxLength={100} autoComplete="off" />}
          </Field>

          <Field label="Category" required error={err("categoryId")}>
            {(id, d) => (
              <Select id={id} aria-describedby={d} value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)} invalid={!!err("categoryId")}>
                <option value="">Choose…</option>
                {categories.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Stored in" required error={err("locationId")}>
            {(id, d) => (
              <Select id={id} aria-describedby={d} value={f.locationId} onChange={(e) => set("locationId", e.target.value)} invalid={!!err("locationId")}>
                <option value="">Choose…</option>
                {locations.data?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {!editing && (
            <Field label="Quantity" required error={err("quantity")}>
              {(id, d) => <Input id={id} aria-describedby={d} type="number" inputMode="decimal" min="0" step="any" value={f.quantity} onChange={(e) => set("quantity", e.target.value)} invalid={!!err("quantity")} />}
            </Field>
          )}
          <Field label="Unit" required error={err("unit")} hint={editing && item!.quantity > 0 ? "The unit can't change while the item has stock" : undefined}>
            {(id, d) => (
              <Select id={id} aria-describedby={d} value={f.unit} onChange={(e) => set("unit", e.target.value)} disabled={editing && item!.quantity > 0}>
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {!editing && (
            <>
              <Field label="Purchase date" error={err("purchaseDate")}>
                {(id, d) => <Input id={id} aria-describedby={d} type="date" max={todayLocal()} value={f.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} invalid={!!err("purchaseDate")} />}
              </Field>
              <Field label="Expiry date" required={!f.noExpiry} error={err("expiryDate")} hint="Use the date printed on the label">
                {(id, d) => <Input id={id} aria-describedby={d} type="date" value={f.noExpiry ? "" : f.expiryDate} disabled={f.noExpiry} onChange={(e) => set("expiryDate", e.target.value)} invalid={!!err("expiryDate")} />}
              </Field>
            </>
          )}

          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--basil)]" checked={f.noExpiry} onChange={(e) => set("noExpiry", e.target.checked)} />
            <span>
              <span className="font-semibold">No expiry date</span>
              <span className="block text-ink-2">Only for foods that genuinely don't expire, like salt or sugar. Items with a missing date are flagged for review, never treated as safe.</span>
            </span>
          </label>

          <Field label="Minimum stock" error={err("minStock")} hint="You'll get a low-stock alert at or below this amount">
            {(id, d) => <Input id={id} aria-describedby={d} type="number" inputMode="decimal" min="0" step="any" value={f.minStock} onChange={(e) => set("minStock", e.target.value)} invalid={!!err("minStock")} />}
          </Field>
          {!editing && (
            <Field label="Price paid (optional)" error={err("cost")} hint="Used for waste-cost estimates">
              {(id, d) => <Input id={id} aria-describedby={d} type="number" inputMode="decimal" min="0" step="0.01" value={f.cost} onChange={(e) => set("cost", e.target.value)} invalid={!!err("cost")} placeholder="e.g. 60" />}
            </Field>
          )}

          {!showMore ? (
            <button type="button" onClick={() => setShowMore(true)} className="justify-self-start text-sm font-semibold text-basil underline-offset-2 hover:underline sm:col-span-2">
              Add brand, barcode, photo or notes
            </button>
          ) : (
            <>
              <Field label="Brand (optional)">{(id) => <Input id={id} value={f.brand} onChange={(e) => set("brand", e.target.value)} maxLength={80} />}</Field>
              <Field label="Barcode (optional)" error={err("barcode")}>
                {(id, d) => (
                  <div className="flex gap-2">
                    <Input id={id} aria-describedby={d} inputMode="numeric" value={f.barcode} onChange={(e) => set("barcode", e.target.value.replace(/\D/g, ""))} invalid={!!err("barcode")} maxLength={14} />
                    <Button variant="secondary" icon={Search} onClick={() => void lookUpBarcode(f.barcode)} loading={lookup.busy} aria-label="Look up barcode" title="Look up barcode">
                      <span className="sr-only sm:not-sr-only">Look up</span>
                    </Button>
                    <Button variant="secondary" icon={ScanBarcode} onClick={() => setScanOpen(true)} aria-label="Scan with camera" title="Scan with camera" />
                  </div>
                )}
              </Field>
              {lookup.message && (
                <p role="status" className={`rounded-lg px-3 py-2 text-sm sm:col-span-2 ${lookup.tone === "ok" ? "bg-basil-soft text-bay" : "bg-turmeric-soft text-turmeric"}`}>
                  {lookup.message}
                </p>
              )}
              <Field label="Days it keeps once opened (optional)" hint="Leave empty to use the category default">
                {(id) => <Input id={id} type="number" min="0" step="1" value={f.openedShelfLifeDays} onChange={(e) => set("openedShelfLifeDays", e.target.value)} placeholder="e.g. 5" />}
              </Field>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Photo (optional)</span>
                {f.imageId ? (
                  <div className="flex items-center gap-3">
                    <img src={apiUrl(`/images/${f.imageId}`)} alt="Item preview" className="size-14 rounded-xl object-cover" />
                    <label className="cursor-pointer text-sm font-semibold text-basil hover:underline">
                      Replace
                      <input type="file" accept="image/*" className="sr-only" onChange={(e) => void onImage(e.target.files?.[0])} />
                    </label>
                    <Button size="sm" variant="ghost" icon={Trash2} onClick={() => set("imageId", null)}>
                      Remove
                    </Button>
                  </div>
                ) : (
                  <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong text-sm font-semibold text-ink-2 hover:bg-surface-2">
                    <ImagePlus className="size-4" aria-hidden />
                    {uploading ? "Uploading…" : "Choose a photo"}
                    <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void onImage(e.target.files?.[0])} disabled={uploading} />
                  </label>
                )}
              </div>
              <Field label="Notes (optional)" className="sm:col-span-2">
                {(id) => <Textarea id={id} value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} />}
              </Field>
            </>
          )}
        </form>
      </Modal>
      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={onDetected} />
    </>
  );
}
