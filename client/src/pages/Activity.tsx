import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, EmptyState, ErrorState, PageHeader, Pagination, Select, Spinner } from "../components/ui";
import { errorMessage, get } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import type { Activity } from "../lib/types";

const FILTERS = [
  { value: "", label: "All activity" },
  { value: "item", label: "Pantry items" },
  { value: "shopping", label: "Shopping list" },
  { value: "category", label: "Categories" },
  { value: "location", label: "Storage locations" },
  { value: "settings", label: "Settings" },
  { value: "import", label: "Imports" },
  { value: "household", label: "Family sharing" },
];

export function ActivityPage() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");
  const q = useQuery({
    queryKey: ["activity", page, entityType],
    queryFn: () => get<{ activities: Activity[]; total: number; page: number; totalPages: number }>("/activity", { page, pageSize: 25, entityType }),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (q.data && q.data.total > 0 && q.data.activities.length === 0 && page > 1) setPage(q.data.totalPages);
  }, [q.data, page]);

  return (
    <>
      <PageHeader title="Activity log" description="A record of every change to your pantry, newest first." />
      <div className="mb-4 sm:w-64">
        <Select aria-label="Filter activity" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }}>
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
      </div>
      <Card>
        {q.isLoading ? (
          <Spinner />
        ) : q.error ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        ) : q.data!.activities.length === 0 ? (
          <EmptyState icon={ScrollText} title="No activity recorded" />
        ) : (
          <>
            <ol className="divide-y divide-line">
              {q.data!.activities.map((a) => (
                <li key={a.id} className="flex flex-col gap-0.5 px-5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                  <span>
                    {a.message}
                    {a.actorName && <span className="text-ink-2"> · by {a.actorName}</span>}
                  </span>
                  <time dateTime={a.createdAt} className="shrink-0 text-sm text-ink-3">
                    {fmtDateTime(a.createdAt)}
                  </time>
                </li>
              ))}
            </ol>
            <Pagination page={q.data!.page} totalPages={q.data!.totalPages} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
