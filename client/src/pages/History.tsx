import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, History as HistoryIcon, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Badge, Card, EmptyState, ErrorState, Input, PageHeader, Pagination, Spinner, Tabs } from "../components/ui";
import { apiUrl, errorMessage, get } from "../lib/api";
import { fmtDateTime, money, qty, reasonLabel } from "../lib/format";
import { useSettings } from "../lib/hooks";
import type { UsageEvent } from "../lib/types";

type Filter = "" | "CONSUMED" | "WASTED";

export function HistoryPage() {
  const [type, setType] = useState<Filter>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const currency = useSettings().data?.settings.currency ?? "INR";
  const q = useQuery({
    queryKey: ["usage", type, search, page],
    queryFn: () => get<{ events: UsageEvent[]; total: number; page: number; totalPages: number }>("/usage", { type, search, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (q.data && q.data.total > 0 && q.data.events.length === 0 && page > 1) setPage(q.data.totalPages);
  }, [q.data, page]);

  return (
    <>
      <PageHeader
        title="Used & wasted"
        description="Every time food was used or thrown away. Record waste honestly; it's how the trends get better."
        actions={
          <a href={apiUrl("/data/export/usage.csv")} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-[15px] font-semibold hover:bg-surface-2">
            <Download className="size-4" aria-hidden />
            Export last 90 days
          </a>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs<Filter>
          value={type}
          onChange={(v) => { setType(v); setPage(1); }}
          tabs={[
            { value: "", label: "Everything" },
            { value: "CONSUMED", label: "Used" },
            { value: "WASTED", label: "Wasted" },
          ]}
        />
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input aria-label="Search by item name" placeholder="Search by item" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
      </div>
      <Card>
        {q.isLoading ? (
          <Spinner />
        ) : q.error ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        ) : q.data!.events.length === 0 ? (
          <EmptyState icon={HistoryIcon} title={search || type ? "No matching records" : "No history yet"}>
            Use “Record use” or “Record waste” on any pantry item and it will appear here.
          </EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[15px]">
                <caption className="sr-only">Consumption and waste history</caption>
                <thead>
                  <tr className="border-b border-line text-left text-sm text-ink-2">
                    <th scope="col" className="px-5 py-3 font-semibold">When</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Item</th>
                    <th scope="col" className="px-3 py-3 font-semibold">What happened</th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">Quantity</th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold">Est. cost</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data!.events.map((e) => (
                    <tr key={e.id} className="border-b border-line last:border-0">
                      <td className="px-5 py-2.5 text-sm whitespace-nowrap text-ink-2">{fmtDateTime(e.occurredAt)}</td>
                      <td className="px-3 py-2.5">
                        {e.itemId ? (
                          <Link to={`/pantry/${e.itemId}`} className="font-semibold hover:underline">
                            {e.itemName}
                          </Link>
                        ) : (
                          <span className="font-semibold">{e.itemName}</span>
                        )}
                        <span className="block text-xs text-ink-3">{e.categoryName}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge className={e.type === "WASTED" ? "bg-chilli-soft text-chilli" : "bg-basil-soft text-bay"}>{e.type === "WASTED" ? "Wasted" : "Used"}</Badge>
                        {e.reason && <span className="ml-2 text-sm text-ink-2">{reasonLabel(e.reason)}</span>}
                        {e.note && <span className="block text-xs text-ink-3">{e.note}</span>}
                      </td>
                      <td className="num px-3 py-2.5 text-right whitespace-nowrap">{qty(e.quantity, e.unit)}</td>
                      <td className="num px-5 py-2.5 text-right text-ink-2">{e.estimatedCost == null ? "—" : money(e.estimatedCost, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={q.data!.page} totalPages={q.data!.totalPages} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
