import { useQuery } from "@tanstack/react-query";
import { RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { ItemThumb } from "../components/pantry-bits";
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, PageHeader, Spinner } from "../components/ui";
import { del, errorMessage, get, post } from "../lib/api";
import { qty, timeAgo } from "../lib/format";
import { useAction } from "../lib/hooks";
import type { Item } from "../lib/types";

export function TrashPage() {
  const q = useQuery({ queryKey: ["trash"], queryFn: () => get<{ items: Item[] }>("/items/trash") });
  const [purge, setPurge] = useState<Item | null>(null);
  const restore = useAction((i: Item) => post(`/items/${i.id}/restore`), { success: (_r, i) => `${i.name} restored to your pantry` });
  const remove = useAction((i: Item) => del(`/items/${i.id}/permanent`), { success: (_r, i) => `${i.name} permanently deleted`, onSuccess: () => setPurge(null) });

  return (
    <>
      <PageHeader title="Trash" description="Items you removed. Restore them, or delete them for good. Usage history is always kept." />
      <Card>
        {q.isLoading ? (
          <Spinner />
        ) : q.error ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        ) : q.data!.items.length === 0 ? (
          <EmptyState icon={Trash2} title="Trash is empty" />
        ) : (
          <ul className="divide-y divide-line">
            {q.data!.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <ItemThumb name={i.name} category={i.category.name} imageId={i.imageId} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{i.name}</p>
                  <p className="text-sm text-ink-2">
                    {qty(i.quantity, i.unit)} · removed {i.deletedAt ? timeAgo(i.deletedAt) : ""}
                  </p>
                </div>
                <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => restore.mutate(i)} loading={restore.isPending && restore.variables?.id === i.id}>
                  Restore
                </Button>
                <Button size="sm" variant="ghost" className="text-chilli" onClick={() => setPurge(i)}>
                  Delete forever
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <ConfirmDialog
        open={Boolean(purge)}
        onClose={() => setPurge(null)}
        onConfirm={() => purge && remove.mutate(purge)}
        loading={remove.isPending}
        danger
        title="Delete permanently?"
        confirmLabel="Delete forever"
        message={`${purge?.name} and its batches will be deleted. This can't be undone. Past usage records stay in your history.`}
      />
    </>
  );
}
