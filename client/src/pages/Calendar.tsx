import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { StatusBadge } from "../components/pantry-bits";
import { Button, Card, ErrorState, IconButton, PageHeader, Spinner } from "../components/ui";
import { errorMessage, get } from "../lib/api";
import { fmtDate, qty, todayLocal } from "../lib/format";
import { STATUS } from "../lib/status";
import type { BatchStatus } from "../lib/types";

interface Entry {
  date: string;
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
  status: BatchStatus;
  reason: "PRINTED" | "OPENED" | null;
}

const shiftMonth = (m: string, n: number) => {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mm - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

export function CalendarPage() {
  const [month, setMonth] = useState(todayLocal().slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["calendar", month], queryFn: () => get<{ entries: Entry[]; today: string }>("/items/calendar", { month }) });

  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday-first grid
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const byDate = new Map<string, Entry[]>();
  for (const e of q.data?.entries ?? []) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const today = q.data?.today ?? todayLocal();
  const label = first.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const dayList = selected ? byDate.get(selected) ?? [] : q.data?.entries ?? [];

  return (
    <>
      <PageHeader title="Expiry calendar" description="See when food in stock reaches its date, so you can plan meals around it." />
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-[650]">{label}</h2>
            <div className="flex items-center gap-1">
              <IconButton icon={ChevronLeft} label="Previous month" onClick={() => { setMonth(shiftMonth(month, -1)); setSelected(null); }} />
              <Button size="sm" variant="ghost" onClick={() => { setMonth(todayLocal().slice(0, 7)); setSelected(null); }}>
                Today
              </Button>
              <IconButton icon={ChevronRight} label="Next month" onClick={() => { setMonth(shiftMonth(month, 1)); setSelected(null); }} />
            </div>
          </div>
          {q.isLoading ? (
            <Spinner />
          ) : q.error ? (
            <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
          ) : (
            <div role="grid" aria-label={`Expiry dates in ${label}`}>
              <div className="grid grid-cols-7 gap-1 pb-1 text-center text-xs font-semibold text-ink-3" role="row">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <div key={d} role="columnheader">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((date, i) => {
                  if (!date) return <div key={`blank-${i}`} aria-hidden />;
                  const entries = byDate.get(date) ?? [];
                  const worst = entries.some((e) => e.status === "EXPIRED") ? "EXPIRED" : entries.some((e) => e.status === "EXPIRING") ? "EXPIRING" : entries.length ? "SAFE" : null;
                  return (
                    <button
                      key={date}
                      role="gridcell"
                      aria-selected={selected === date}
                      aria-label={`${fmtDate(date)}: ${entries.length ? `${entries.length} item(s) expire` : "nothing expires"}`}
                      onClick={() => setSelected(selected === date ? null : date)}
                      className={clsx(
                        "flex min-h-16 flex-col items-start rounded-lg border p-1.5 text-left transition-colors sm:min-h-20",
                        selected === date ? "border-basil ring-2 ring-basil/30" : "border-line hover:border-line-strong",
                        date === today && "bg-basil-soft",
                      )}
                    >
                      <span className={clsx("num text-xs font-semibold", date === today ? "text-bay" : "text-ink-2")}>{Number(date.slice(8))}</span>
                      {entries.length > 0 && worst && (
                        <span className={clsx("mt-auto inline-flex items-center gap-1 rounded-full px-1.5 text-[11px] font-bold", STATUS[worst].bg, STATUS[worst].text)}>
                          {entries.length}
                          <span className="hidden sm:inline">{entries.length === 1 ? " item" : " items"}</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <h2 className="text-[17px] font-semibold">{selected ? fmtDate(selected) : `All of ${label}`}</h2>
            {selected && (
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                Show whole month
              </Button>
            )}
          </div>
          {dayList.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-ink-2">{selected ? "Nothing in stock expires on this day." : "Nothing in stock expires this month."}</p>
          ) : (
            <ul className="divide-y divide-line">
              {dayList.map((e, i) => (
                <li key={`${e.itemId}-${i}`} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link to={`/pantry/${e.itemId}`} className="font-semibold hover:underline">
                      {e.name}
                    </Link>
                    <p className="num text-sm text-ink-2">
                      {qty(e.quantity, e.unit)} · {fmtDate(e.date)}
                      {e.reason === "OPENED" && " (opened)"}
                    </p>
                  </div>
                  <StatusBadge status={e.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
