import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, DoorOpen, Eye, Home, KeyRound, Pencil, RefreshCw, Share2, Trash2, UserMinus, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { del, errorMessage, get, patch, post } from "../lib/api";
import { useAction } from "../lib/hooks";
import { Badge, Button, Card, CardHeader, ConfirmDialog, ErrorState, Field, Input, Select, Spinner } from "./ui";

export type HouseholdRole = "OWNER" | "EDITOR" | "VIEWER";
export interface HouseholdView {
  role: HouseholdRole;
  household: null | {
    id: string;
    name: string;
    inviteCode: string | null;
    owner: { userId: string; name: string; email: string };
    members: { userId: string; name: string; email: string; role: "EDITOR" | "VIEWER"; joinedAt: string }[];
  };
}

export const useHousehold = () => useQuery({ queryKey: ["household"], queryFn: () => get<HouseholdView>("/household"), staleTime: 60_000 });

const ROLE_LABEL: Record<HouseholdRole, string> = { OWNER: "Owner", EDITOR: "Can edit", VIEWER: "View only" };
const prettyCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;

/** Switching pantries changes every list in the app, so all cached data is dropped (except who's signed in). */
function useSwitchPantry() {
  const qc = useQueryClient();
  return () => qc.resetQueries({ predicate: (q) => q.queryKey[0] !== "me" });
}

export function HouseholdPanel({ myUserId }: { myUserId?: string }) {
  const q = useHousehold();
  const switchPantry = useSwitchPantry();
  const [params] = useSearchParams();
  const [name, setName] = useState("");
  const [code, setCode] = useState(params.get("code") ?? "");
  const [codeError, setCodeError] = useState<string>();
  const [rename, setRename] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: "leave" | "delete" | "newCode" } | { kind: "remove"; userId: string; name: string }>(null);

  const create = useAction((n: string) => post<HouseholdView>("/household", { name: n }), { success: "Household created. Share the code to invite your family." });
  const join = useAction((c: string) => post<HouseholdView>("/household/join", { code: c }), {
    silentError: true,
    onSuccess: (r) => {
      switchPantry();
      toast.success(`You joined ${r.household?.name}. You're now sharing their pantry.`);
    },
  });
  const setRole = useAction(({ userId, role }: { userId: string; role: string }) => patch(`/household/members/${userId}`, { role }), { success: "Access updated" });
  const saveName = useAction((n: string) => patch("/household", { name: n }), { success: "Household renamed", onSuccess: () => setRename(null) });

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const { household: h, role } = q.data;

  const submitJoin = (e: FormEvent) => {
    e.preventDefault();
    setCodeError(undefined);
    if (!code.trim()) return setCodeError("Enter the invite code");
    join.mutate(code, { onError: (err) => setCodeError(errorMessage(err)) });
  };

  async function runConfirm() {
    if (!confirm) return;
    try {
      if (confirm.kind === "leave") {
        await post("/household/leave");
        switchPantry();
        toast.success("You left the household. Your own pantry is back.");
      } else if (confirm.kind === "delete") {
        await del("/household");
        switchPantry();
        toast.success("Household deleted. Everyone is back on their own pantry.");
      } else if (confirm.kind === "newCode") {
        await post("/household/invite-code");
        toast.success("New code made. The old one no longer works.");
      } else if (confirm.kind === "remove") {
        await del(`/household/members/${confirm.userId}`);
        toast.success(`${confirm.name} was removed`);
      }
      q.refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function share(c: string) {
    const link = `${window.location.origin}/join/${c}`;
    const text = `Join our Smart Pantry "${h?.name}". Open ${link} or enter code ${prettyCode(c)} in Settings → Family sharing.`;
    try {
      if (navigator.share) await navigator.share({ title: "Join our Smart Pantry", text });
      else {
        await navigator.clipboard.writeText(text);
        toast.success("Invite copied. Paste it into WhatsApp or a text message.");
      }
    } catch {
      /* user cancelled the share sheet */
    }
  }

  if (!h) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Share your pantry with family" description="Everyone in the household sees the same pantry, shopping list and alerts, and can update them from their own phone." />
          <form
            className="grid gap-3 px-5 pb-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) create.mutate(name.trim());
            }}
          >
            <Field label="Household name" hint='For example "Sharma family" or "Flat 4B"'>
              {(id, d) => <Input id={id} aria-describedby={d} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Sharma family" />}
            </Field>
            <Button type="submit" icon={Home} className="justify-self-start" loading={create.isPending} disabled={!name.trim()}>
              Create household
            </Button>
          </form>
        </Card>
        <Card>
          <CardHeader title="Join a household" description="Got a code from someone? Enter it here. While you're a member you'll see their pantry; your own items stay safe and come back if you leave." />
          <form className="grid gap-3 px-5 pb-5" onSubmit={submitJoin} noValidate>
            <Field label="Invite code" error={codeError}>
              {(id, d) => (
                <Input id={id} aria-describedby={d} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD-2345" autoComplete="off" autoCapitalize="characters" className="font-mono tracking-widest" invalid={!!codeError} />
              )}
            </Field>
            <Button type="submit" icon={KeyRound} variant="secondary" className="justify-self-start" loading={join.isPending}>
              Join household
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  const isOwner = role === "OWNER";
  const people = [{ userId: h.owner.userId, name: h.owner.name, email: h.owner.email, role: "OWNER" as HouseholdRole }, ...h.members];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="md:col-span-2">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Users className="size-5 text-basil" aria-hidden /> {h.name}
            </span>
          }
          description={isOwner ? `${h.members.length} other ${h.members.length === 1 ? "person shares" : "people share"} your pantry.` : `You're sharing ${h.owner.name}'s pantry · ${ROLE_LABEL[role]}`}
          action={
            isOwner && rename === null ? (
              <Button variant="ghost" icon={Pencil} onClick={() => setRename(h.name)}>
                Rename
              </Button>
            ) : undefined
          }
        />
        {rename !== null && (
          <form
            className="flex flex-wrap items-end gap-2 px-5 pb-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (rename.trim()) saveName.mutate(rename.trim());
            }}
          >
            <Field label="Household name" className="min-w-56 flex-1">
              {(id) => <Input id={id} value={rename} onChange={(e) => setRename(e.target.value)} maxLength={60} autoFocus />}
            </Field>
            <Button type="submit" loading={saveName.isPending}>
              Save
            </Button>
            <Button variant="ghost" onClick={() => setRename(null)}>
              Cancel
            </Button>
          </form>
        )}
        {isOwner && h.inviteCode && (
          <div className="mx-5 mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line bg-surface-2 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">Invite code</p>
              <p className="font-mono text-2xl font-bold tracking-[0.2em]" aria-label={`Invite code ${h.inviteCode.split("").join(" ")}`}>
                {prettyCode(h.inviteCode)}
              </p>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button icon={Share2} onClick={() => share(h.inviteCode!)}>
                Invite
              </Button>
              <Button
                variant="secondary"
                icon={Copy}
                onClick={() => navigator.clipboard.writeText(h.inviteCode!).then(() => toast.success("Code copied"), () => toast.error("Couldn't copy. Select the code and copy it."))}
              >
                Copy code
              </Button>
              <Button variant="ghost" icon={RefreshCw} onClick={() => setConfirm({ kind: "newCode" })}>
                New code
              </Button>
            </div>
          </div>
        )}
        <ul className="divide-y divide-line border-t border-line" aria-label="People in this household">
          {people.map((p) => (
            <li key={p.userId} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-basil-soft font-semibold text-basil" aria-hidden>
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {p.name} {p.userId === myUserId && <span className="text-ink-2">(you)</span>}
                </p>
                <p className="truncate text-sm text-ink-2">{p.email}</p>
              </div>
              {isOwner && p.role !== "OWNER" ? (
                <>
                  <label className="sr-only" htmlFor={`role-${p.userId}`}>
                    Access for {p.name}
                  </label>
                  <Select id={`role-${p.userId}`} value={p.role} onChange={(e) => setRole.mutate({ userId: p.userId, role: e.target.value })} className="w-auto">
                    <option value="EDITOR">Can edit</option>
                    <option value="VIEWER">View only</option>
                  </Select>
                  <Button variant="ghost" icon={UserMinus} aria-label={`Remove ${p.name}`} onClick={() => setConfirm({ kind: "remove", userId: p.userId, name: p.name })}>
                    <span className="hidden sm:inline">Remove</span>
                  </Button>
                </>
              ) : (
                <Badge className={p.role === "OWNER" ? "bg-turmeric-soft text-turmeric" : p.role === "VIEWER" ? "bg-slate-soft text-slate" : "bg-basil-soft text-basil"}>
                  {p.role === "VIEWER" && <Eye className="size-3.5" aria-hidden />} {ROLE_LABEL[p.role]}
                </Badge>
              )}
            </li>
          ))}
        </ul>
        {isOwner && h.members.length === 0 && <p className="px-5 pb-5 text-sm text-ink-2">No one has joined yet. Tap Invite to send the code on WhatsApp or by text.</p>}
        <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4">
          {isOwner ? (
            <Button variant="danger" icon={Trash2} onClick={() => setConfirm({ kind: "delete" })}>
              Delete household
            </Button>
          ) : (
            <Button variant="secondary" icon={DoorOpen} onClick={() => setConfirm({ kind: "leave" })}>
              Leave household
            </Button>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        title={
          confirm?.kind === "leave" ? "Leave this household?" : confirm?.kind === "delete" ? "Delete the household?" : confirm?.kind === "newCode" ? "Make a new invite code?" : `Remove ${confirm && "name" in confirm ? confirm.name : ""}?`
        }
        message={
          confirm?.kind === "leave"
            ? "You'll stop seeing this pantry and go back to your own. You can join again with a code."
            : confirm?.kind === "delete"
              ? "Everyone goes back to their own pantry. Your pantry and its items are kept."
              : confirm?.kind === "newCode"
                ? "The current code stops working. People already in the household stay."
                : "They'll stop seeing your pantry straight away. Their own pantry is kept."
        }
        confirmLabel={confirm?.kind === "leave" ? "Leave" : confirm?.kind === "delete" ? "Delete household" : confirm?.kind === "newCode" ? "Make new code" : "Remove"}
        danger={confirm?.kind !== "newCode"}
      />
    </div>
  );
}
