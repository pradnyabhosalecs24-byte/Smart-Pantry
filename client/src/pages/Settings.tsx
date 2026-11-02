import {
  Download,
  FileUp,
  LogOut,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { HouseholdPanel } from "../components/HouseholdPanel";
import { PushCard } from "../components/PushCard";
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  ErrorState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Tabs,
  Toggle,
} from "../components/ui";
import { useAuth } from "../context/auth";
import {
  api,
  ApiError,
  apiUrl,
  del as apiDel,
  errorMessage,
  patch,
  post,
  put,
} from "../lib/api";
import {
  useAction,
  useCategories,
  useLocations,
  useRefreshAll,
  useSettings,
} from "../lib/hooks";
import type { Settings, User } from "../lib/types";

type Tab =
  "preferences" | "household" | "categories" | "locations" | "data" | "account";

// ---------- Preferences ----------

function Preferences() {
  const q = useSettings();
  const [s, setS] = useState<Settings | null>(null);
  const [error, setError] = useState<string | undefined>();
  const save = useAction((v: Settings) => put("/settings", v), {
    success: "Settings saved",
  });
  useEffect(() => {
    if (q.data) setS(q.data.settings);
  }, [q.data]);

  if (q.isLoading || !s) return <Spinner />;
  if (q.error) return <ErrorState message={errorMessage(q.error)} />;
  const zones = (
    Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
  ).supportedValuesOf?.("timeZone") ?? [s.timezone];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const d = Number(s.warningDays);
    if (!Number.isInteger(d) || d < 0 || d > 60) {
      setError("Use a whole number of days from 0 to 60");
      return;
    }
    setError(undefined);
    save.mutate({ ...s, warningDays: d });
  };

  return (
    <>
      <form onSubmit={submit} noValidate>
        <Card>
          <CardHeader title="Expiry & display" />
          <div className="grid gap-4 px-5 pb-5 sm:grid-cols-3">
            <Field
              label="Warn me this many days before expiry"
              error={error}
              hint="Default is 7. Items inside this window show as “Expiring soon”."
            >
              {(id, d) => (
                <Input
                  id={id}
                  aria-describedby={d}
                  type="number"
                  min={0}
                  max={60}
                  value={s.warningDays}
                  onChange={(e) =>
                    setS({
                      ...s,
                      warningDays: e.target.value as unknown as number,
                    })
                  }
                  invalid={!!error}
                />
              )}
            </Field>
            <Field
              label="Time zone"
              hint="Decides when “today” starts for expiry dates"
            >
              {(id, d) => (
                <Select
                  id={id}
                  aria-describedby={d}
                  value={s.timezone}
                  onChange={(e) => setS({ ...s, timezone: e.target.value })}
                >
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Currency">
              {(id) => (
                <Select
                  id={id}
                  value={s.currency}
                  onChange={(e) => setS({ ...s, currency: e.target.value })}
                >
                  {q.data!.currencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </Card>
        <Card className="mt-4">
          <CardHeader
            title="Notifications"
            description="In-app alerts are always available. Each alert is created once, not repeated."
          />
          <div className="divide-y divide-line px-5 pb-2">
            <Toggle
              label="Expiring and expired items"
              checked={s.notifyExpiring}
              onChange={(v) => setS({ ...s, notifyExpiring: v })}
            />
            <Toggle
              label="Low stock"
              checked={s.notifyLowStock}
              onChange={(v) => setS({ ...s, notifyLowStock: v })}
            />
            <Toggle
              label="Forecast: running out within 3 days"
              description="Based on your recent use"
              checked={s.notifyRunOut}
              onChange={(v) => setS({ ...s, notifyRunOut: v })}
            />
            <Toggle
              label="Daily email summary"
              description={
                q.data!.emailConfigured
                  ? "Sent once a day when there are new alerts."
                  : "Email isn't configured on this server yet (see README: SMTP settings). Until then nothing is emailed."
              }
              checked={s.emailReminders}
              onChange={(v) => setS({ ...s, emailReminders: v })}
            />
          </div>
        </Card>
        <div className="mt-4 flex justify-end">
          <Button type="submit" loading={save.isPending}>
            Save settings
          </Button>
        </div>
      </form>
      <div className="mt-4">
        <PushCard />
      </div>
    </>
  );
}

// ---------- Categories & locations ----------

function Taxonomy({ kind }: { kind: "categories" | "locations" }) {
  const isCat = kind === "categories";
  const label = isCat ? "category" : "storage location";
  const categories = useCategories();
  const locations = useLocations();
  const list = (isCat ? categories.data : locations.data) as
    | {
        id: string;
        name: string;
        itemCount: number;
        openedShelfLifeDays?: number | null;
      }[]
    | undefined;
  const refresh = useRefreshAll();
  const [editing, setEditing] = useState<{
    id?: string;
    name: string;
    days: string;
  } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<{
    id: string;
    name: string;
    itemCount: number;
  } | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (!editing.name.trim()) {
      setErrors({ name: "Enter a name" });
      return;
    }
    setBusy(true);
    try {
      const body = isCat
        ? {
            name: editing.name.trim(),
            openedShelfLifeDays:
              editing.days === "" ? null : Number(editing.days),
          }
        : { name: editing.name.trim() };
      if (editing.id) await patch(`/${kind}/${editing.id}`, body);
      else await post(`/${kind}`, body);
      toast.success(editing.id ? "Saved" : `Added ${editing.name.trim()}`);
      refresh();
      setEditing(null);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length)
        setErrors(err.fields);
      else toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      const r = await apiDel<{ moved: number }>(
        `/${kind}/${deleting.id}`,
        reassignTo ? { reassignTo } : undefined,
      );
      toast.success(
        r.moved
          ? `Deleted and moved ${r.moved} item(s)`
          : `Deleted ${deleting.name}`,
      );
      refresh();
      setDeleting(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={isCat ? "Categories" : "Storage locations"}
        description={
          isCat
            ? "“Keeps once opened” sets the default shelf life after opening for items in the category."
            : "Where food is kept in your home."
        }
        action={
          <Button
            size="sm"
            icon={Plus}
            onClick={() => {
              setErrors({});
              setEditing({ name: "", days: "" });
            }}
          >
            Add {label}
          </Button>
        }
      />
      {!list ? (
        <Spinner />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {list.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-5 py-2.5">
              <div className="flex-1">
                <p className="font-semibold">{c.name}</p>
                <p className="text-sm text-ink-2">
                  {c.itemCount} item{c.itemCount === 1 ? "" : "s"}
                  {isCat &&
                    c.openedShelfLifeDays != null &&
                    ` · keeps ${c.openedShelfLifeDays} days once opened`}
                </p>
              </div>
              <IconButton
                icon={Pencil}
                label={`Edit ${c.name}`}
                onClick={() => {
                  setErrors({});
                  setEditing({
                    id: c.id,
                    name: c.name,
                    days:
                      c.openedShelfLifeDays == null
                        ? ""
                        : String(c.openedShelfLifeDays),
                  });
                }}
              />
              <IconButton
                icon={Trash2}
                label={`Delete ${c.name}`}
                onClick={() => {
                  setReassignTo("");
                  setDeleting(c);
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        size="sm"
        title={editing?.id ? `Edit ${label}` : `Add ${label}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form="tax-form" loading={busy}>
              Save
            </Button>
          </>
        }
      >
        {editing && (
          <form id="tax-form" onSubmit={save} noValidate className="grid gap-3">
            <Field label="Name" error={errors.name}>
              {(id, d) => (
                <Input
                  id={id}
                  aria-describedby={d}
                  value={editing.name}
                  maxLength={50}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  invalid={!!errors.name}
                />
              )}
            </Field>
            {isCat && (
              <Field
                label="Keeps once opened (days, optional)"
                error={errors.openedShelfLifeDays}
              >
                {(id, d) => (
                  <Input
                    id={id}
                    aria-describedby={d}
                    type="number"
                    min={0}
                    value={editing.days}
                    onChange={(e) =>
                      setEditing({ ...editing, days: e.target.value })
                    }
                  />
                )}
              </Field>
            )}
          </form>
        )}
      </Modal>

      {deleting && deleting.itemCount > 0 ? (
        <Modal
          open
          onClose={() => setDeleting(null)}
          size="sm"
          title={`Delete “${deleting.name}”?`}
          description={`${deleting.itemCount} item(s) use it. Choose where to move them first.`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={!reassignTo}
                loading={busy}
                onClick={() => void confirmDelete()}
              >
                Move items and delete
              </Button>
            </>
          }
        >
          <Field label={`Move items to`}>
            {(id) => (
              <Select
                id={id}
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
              >
                <option value="">Choose…</option>
                {list
                  ?.filter((c) => c.id !== deleting.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
        </Modal>
      ) : (
        <ConfirmDialog
          open={Boolean(deleting)}
          onClose={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()}
          loading={busy}
          danger
          title={`Delete “${deleting?.name}”?`}
          message={`No items use this ${label}.`}
          confirmLabel="Delete"
        />
      )}
    </Card>
  );
}

// ---------- Import / export / backup / demo ----------

interface ImportResult {
  dryRun: boolean;
  totalRows: number;
  validRows: number;
  errors: { row: number; field: string; message: string }[];
  duplicates: { row: number; name: string; reason: string }[];
  addsToExisting: { row: number; name: string }[];
  newCategories: string[];
  newLocations: string[];
  created?: number;
  batchesAdded?: number;
}

function DataTab() {
  const refresh = useRefreshAll();
  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState<{
    name: string;
    data: unknown;
    summary?: {
      items: { add: number; skipExisting: number };
      shopping: { add: number };
      usage: { add: number };
    };
  } | null>(null);
  const [clearDemo, setClearDemo] = useState(false);
  const loadDemo = useAction(() => post<{ items: number }>("/demo"), {
    success: (r) => `Loaded ${r.items} demo items`,
  });
  const removeDemo = useAction(() => apiDel<{ items: number }>("/demo"), {
    success: (r) => `Removed ${r.items} demo items`,
    onSuccess: () => setClearDemo(false),
  });

  async function readCsv(file?: File) {
    if (!file) return;
    if (file.size > 1_000_000)
      return toast.error("File is too large (max 1 MB)");
    const text = await file.text();
    setCsv({ name: file.name, text });
    setBusy(true);
    try {
      setPreview(
        await post<ImportResult>("/data/import/items", {
          csv: text,
          dryRun: true,
        }),
      );
    } catch (e) {
      setPreview(null);
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function commitCsv() {
    if (!csv) return;
    setBusy(true);
    try {
      const r = await post<ImportResult>("/data/import/items", {
        csv: csv.text,
        dryRun: false,
      });
      toast.success(
        `Imported ${r.created} new item(s) and ${r.batchesAdded} batch(es)`,
      );
      refresh();
      setCsv(null);
      setPreview(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function readBackup(file?: File) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const r = await post<{ summary: NonNullable<typeof backup>["summary"] }>(
        "/data/restore",
        { backup: data, dryRun: true },
      );
      setBackup({ name: file.name, data, summary: r.summary });
    } catch (e) {
      toast.error(
        e instanceof SyntaxError
          ? "That file isn't valid JSON"
          : errorMessage(e),
      );
    }
  }

  async function restore() {
    if (!backup) return;
    setBusy(true);
    try {
      await post("/data/restore", { backup: backup.data, dryRun: false });
      toast.success("Backup restored");
      refresh();
      setBackup(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const dl = (path: string, text: string) => (
    <a
      href={apiUrl(path)}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold hover:bg-surface-2"
    >
      <Download className="size-4" aria-hidden />
      {text}
    </a>
  );

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader
          title="Export"
          description="Download your data as spreadsheets or a printable report."
        />
        <div className="flex flex-wrap gap-2 px-5 pb-5">
          {dl("/data/export/items.csv", "Pantry (CSV)")}
          {dl("/data/export/shopping.csv", "Shopping list (CSV)")}
          {dl("/data/export/usage.csv", "Used & wasted, 90 days (CSV)")}
          {dl("/data/export/report.pdf", "Report (PDF)")}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Import items from CSV"
          description="Check the file first: nothing is saved until you confirm. Rows already in your pantry are skipped."
        />
        <div className="flex flex-wrap items-center gap-2 px-5 pb-4">
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-basil px-3 text-sm font-semibold text-white hover:bg-basil-hover">
            <FileUp className="size-4" aria-hidden />
            Choose CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                void readCsv(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {dl("/data/import/template.csv", "Download template")}
          <span className="text-sm text-ink-2">
            Dates as YYYY-MM-DD or DD/MM/YYYY.
          </span>
        </div>
        {busy && !preview && <Spinner label="Checking file" />}
        {preview && csv && (
          <div className="border-t border-line px-5 py-4 text-sm">
            <p className="font-semibold">
              {csv.name}: {preview.validRows} of {preview.totalRows} row(s)
              ready to import
            </p>
            {preview.addsToExisting.length > 0 && (
              <p className="mt-1 text-ink-2">
                {preview.addsToExisting.length} row(s) will be added as new
                batches of items you already have.
              </p>
            )}
            {(preview.newCategories.length > 0 ||
              preview.newLocations.length > 0) && (
              <p className="mt-1 text-ink-2">
                Will create:{" "}
                {[
                  ...preview.newCategories.map((c) => `category “${c}”`),
                  ...preview.newLocations.map((l) => `location “${l}”`),
                ].join(", ")}
              </p>
            )}
            {preview.duplicates.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer font-semibold text-turmeric">
                  {preview.duplicates.length} duplicate row(s) will be skipped
                </summary>
                <ul className="mt-1 list-disc pl-5 text-ink-2">
                  {preview.duplicates.map((d) => (
                    <li key={d.row}>
                      Row {d.row} ({d.name}): {d.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {preview.errors.length > 0 && (
              <div className="mt-2 rounded-lg bg-chilli-soft p-3">
                <p className="font-semibold text-chilli">
                  {preview.errors.length} problem(s) to fix in the file (these
                  rows are skipped)
                </p>
                <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5 text-ink">
                  {preview.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.row}, {e.field}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <Button
                onClick={() => void commitCsv()}
                loading={busy}
                disabled={preview.validRows === 0}
              >
                Import {preview.validRows} row(s)
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setPreview(null);
                  setCsv(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Backup & restore"
          description="A backup is a JSON file of all your data. Restoring adds missing records; it never overwrites or deletes anything."
        />
        <div className="flex flex-wrap items-center gap-2 px-5 pb-5">
          {dl("/data/backup.json", "Download backup")}
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold hover:bg-surface-2">
            <FileUp className="size-4" aria-hidden />
            Restore from backup
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(e) => {
                void readBackup(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Demo data"
          description="Realistic sample items with three months of history, for trying the app or presenting it. Demo items are labelled and removable."
        />
        <div className="flex flex-wrap gap-2 px-5 pb-5">
          <Button
            variant="subtle"
            icon={Sparkles}
            onClick={() => loadDemo.mutate()}
            loading={loadDemo.isPending}
          >
            Load demo data
          </Button>
          <Button
            variant="ghost"
            icon={Trash2}
            onClick={() => setClearDemo(true)}
          >
            Remove demo data
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={clearDemo}
        onClose={() => setClearDemo(false)}
        onConfirm={() => removeDemo.mutate()}
        loading={removeDemo.isPending}
        danger
        title="Remove demo data?"
        message="Only items and history marked as demo are removed. Your own data is untouched."
        confirmLabel="Remove demo data"
      />
      <ConfirmDialog
        open={Boolean(backup)}
        onClose={() => setBackup(null)}
        onConfirm={() => void restore()}
        loading={busy}
        title="Restore this backup?"
        confirmLabel="Restore"
        message={
          backup?.summary && (
            <ul className="list-disc pl-5">
              <li>
                {backup.summary.items.add} item(s) will be added (
                {backup.summary.items.skipExisting} already exist and are
                skipped)
              </li>
              <li>{backup.summary.shopping.add} shopping list entr(ies)</li>
              <li>{backup.summary.usage.add} history record(s)</li>
            </ul>
          )
        }
      />
    </div>
  );
}

// ---------- Account ----------

function Account() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const saveName = useAction(
    (n: string) => patch<{ user: User }>("/auth/me", { name: n }),
    { success: "Name updated", onSuccess: (r) => setUser(r.user) },
  );
  const [busy, setBusy] = useState(false);

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await post("/auth/change-password", pw);
      toast.success("Password changed. Other devices have been signed out.");
      setPw({ currentPassword: "", newPassword: "" });
      setErrors({});
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length)
        setErrors(err.fields);
      else toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const navigate = useNavigate();
  const [signOutAll, setSignOutAll] = useState(false);
  const [del, setDel] = useState<{
    password: string;
    confirm: string;
    errors: Record<string, string>;
  } | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  async function deleteAccount() {
    if (!del) return;
    setDelBusy(true);
    try {
      await api("/auth/me", {
        method: "DELETE",
        body: { password: del.password, confirm: del.confirm },
      });
      setUser(null);
      toast.success("Your account and all its data were deleted");
      navigate("/login", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length)
        setDel({ ...del, errors: err.fields });
      else toast.error(errorMessage(err));
    } finally {
      setDelBusy(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader title="Profile" description={user?.email} />
        <form
          className="grid gap-3 px-5 pb-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) saveName.mutate(name.trim());
          }}
        >
          <Field label="Name">
            {(id) => (
              <Input
                id={id}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
              />
            )}
          </Field>
          <Button
            type="submit"
            className="justify-self-start"
            loading={saveName.isPending}
          >
            Save name
          </Button>
        </form>
      </Card>
      <Card>
        <CardHeader title="Change password" />
        <form
          className="grid gap-3 px-5 pb-5"
          onSubmit={changePassword}
          noValidate
        >
          <Field label="Current password" error={errors.currentPassword}>
            {(id, d) => (
              <Input
                id={id}
                aria-describedby={d}
                type="password"
                autoComplete="current-password"
                value={pw.currentPassword}
                onChange={(e) =>
                  setPw({ ...pw, currentPassword: e.target.value })
                }
                invalid={!!errors.currentPassword}
              />
            )}
          </Field>
          <Field
            label="New password"
            error={errors.newPassword}
            hint="At least 8 characters with a letter and a number"
          >
            {(id, d) => (
              <Input
                id={id}
                aria-describedby={d}
                type="password"
                autoComplete="new-password"
                value={pw.newPassword}
                onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
                invalid={!!errors.newPassword}
              />
            )}
          </Field>
          <Button type="submit" className="justify-self-start" loading={busy}>
            Change password
          </Button>
        </form>
      </Card>
      <Card>
        <CardHeader
          title="Signed-in devices"
          description="Lost a phone or used a shared computer? Sign out everywhere, including here."
        />
        <div className="px-5 pb-5">
          <Button
            variant="secondary"
            icon={LogOut}
            onClick={() => setSignOutAll(true)}
          >
            Sign out of all devices
          </Button>
        </div>
      </Card>
      <Card className="border-chilli/30">
        <CardHeader
          title="Delete account"
          description="Permanently deletes your account and everything in it. Download a backup first if you might need it."
        />
        <div className="px-5 pb-5">
          <Button
            variant="danger"
            icon={Trash2}
            onClick={() => setDel({ password: "", confirm: "", errors: {} })}
          >
            Delete my account
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={signOutAll}
        onClose={() => setSignOutAll(false)}
        onConfirm={async () => {
          try {
            await post("/auth/logout-all");
            setUser(null);
            toast.success("Signed out of all devices");
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
        title="Sign out of all devices?"
        message="Every device, including this one, will need to sign in again."
        confirmLabel="Sign out everywhere"
      />
      <Modal
        open={Boolean(del)}
        onClose={() => setDel(null)}
        size="sm"
        title="Delete your account?"
        description="This can't be undone. All items, history, lists and settings are deleted."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDel(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={delBusy}
              disabled={!del?.password || del?.confirm !== "DELETE"}
              onClick={() => void deleteAccount()}
            >
              Delete forever
            </Button>
          </>
        }
      >
        {del && (
          <div className="grid gap-3">
            <Field label="Your password" error={del.errors.password}>
              {(id, d) => (
                <Input
                  id={id}
                  aria-describedby={d}
                  type="password"
                  autoComplete="current-password"
                  value={del.password}
                  onChange={(e) => setDel({ ...del, password: e.target.value })}
                  invalid={!!del.errors.password}
                />
              )}
            </Field>
            <Field label="Type DELETE to confirm" error={del.errors.confirm}>
              {(id, d) => (
                <Input
                  id={id}
                  aria-describedby={d}
                  value={del.confirm}
                  onChange={(e) => setDel({ ...del, confirm: e.target.value })}
                  autoComplete="off"
                />
              )}
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "preferences";
  return (
    <>
      <PageHeader title="Settings" />
      <div className="mb-5">
        <Tabs<Tab>
          value={tab}
          onChange={(v) => setParams({ tab: v }, { replace: true })}
          tabs={[
            { value: "preferences", label: "Preferences" },
            { value: "categories", label: "Categories" },
            { value: "locations", label: "Locations" },
            { value: "household", label: "Family sharing" },
            { value: "data", label: "Import, export & backup" },
            { value: "account", label: "Account" },
          ]}
        />
      </div>
      {tab === "preferences" && <Preferences />}
      {tab === "household" && <HouseholdPanel myUserId={user?.id} />}
      {tab === "categories" && <Taxonomy kind="categories" />}
      {tab === "locations" && <Taxonomy kind="locations" />}
      {tab === "data" && <DataTab />}
      {tab === "account" && <Account />}
    </>
  );
}
