import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import { useState } from "react";
import { ActivityTrend, ChartCard, SimpleBars, StatusDonut } from "../components/charts";
import { Card, ErrorState, Field, Input, PageHeader, Spinner, Tabs } from "../components/ui";
import { apiUrl, errorMessage, get, withQuery } from "../lib/api";
import { addDays, fmtDate, money, monthLabel, reasonLabel, todayLocal } from "../lib/format";
import type { Analytics } from "../lib/types";

type Preset = "30" | "90" | "180" | "365" | "custom";

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="num mt-1 font-display text-[26px] leading-tight font-[650]">{value}</p>
      {note && <p className="mt-1 text-xs text-ink-3">{note}</p>}
    </Card>
  );
}

export function AnalyticsPage() {
  const [preset, setPreset] = useState<Preset>("90");
  const today = todayLocal();
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today });
  const range = preset === "custom" ? custom : { from: addDays(today, -(Number(preset) - 1)), to: today };
  const invalid = preset === "custom" && (!custom.from || !custom.to || custom.from > custom.to);

  const q = useQuery({
    queryKey: ["analytics", range.from, range.to],
    queryFn: () => get<Analytics>("/analytics", range),
    enabled: !invalid,
    placeholderData: keepPreviousData,
  });
  const a = q.data;
  const cur = a?.currency ?? "INR";

  return (
    <>
      <PageHeader
        title="Analytics"
        description="How your pantry is used over time. Costs are estimates from the prices you entered."
        actions={
          <>
            <a href={apiUrl(withQuery("/data/export/analytics.csv", range))} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-[15px] font-semibold hover:bg-surface-2">
              <Download className="size-4" aria-hidden />
              CSV
            </a>
            <a href={apiUrl(withQuery("/data/export/report.pdf", range))} className="inline-flex h-10 items-center gap-2 rounded-lg bg-basil px-4 text-[15px] font-semibold text-white hover:bg-basil-hover">
              <FileText className="size-4" aria-hidden />
              PDF report
            </a>
          </>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end">
        <Tabs<Preset>
          value={preset}
          onChange={setPreset}
          tabs={[
            { value: "30", label: "30 days" },
            { value: "90", label: "90 days" },
            { value: "180", label: "6 months" },
            { value: "365", label: "12 months" },
            { value: "custom", label: "Custom" },
          ]}
        />
        {preset === "custom" && (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="From" error={invalid ? "Start must be before end" : undefined}>
              {(id, d) => <Input id={id} aria-describedby={d} type="date" max={custom.to} value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="w-44" />}
            </Field>
            <Field label="To">{(id) => <Input id={id} type="date" max={today} value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="w-44" />}</Field>
          </div>
        )}
        {a && <p className="text-sm text-ink-2 lg:ml-auto">{fmtDate(a.range.from)} to {fmtDate(a.range.to)}</p>}
      </div>

      {q.isLoading ? (
        <Spinner />
      ) : q.error ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : !a ? null : (
        <div className={q.isFetching ? "opacity-75 transition-opacity" : ""}>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Waste rate" value={`${a.summary.wasteRate}%`} note={`${a.summary.wastedEvents} wasted of ${a.summary.wastedEvents + a.summary.consumedEvents} records`} />
            <Tile
              label="Food wasted (est. cost)"
              value={money(a.summary.wastedEstimatedCost, cur)}
              note={a.summary.wastedWithoutPrice ? `${a.summary.wastedWithoutPrice} record(s) had no price` : "All records had a price"}
            />
            <Tile label="Spent on groceries" value={money(a.summary.purchaseCost, cur)} note={a.summary.purchasesWithoutPrice ? `${a.summary.purchasesWithoutPrice} purchase(s) had no price` : undefined} />
            <Tile label="Stock value now" value={money(a.summary.stockValue, cur)} note={`${a.summary.lowStockItems} item(s) low on stock`} />
          </div>

          {a.summary.wastedByUnit.length > 0 && (
            <p className="mb-5 text-sm text-ink-2">
              Wasted in this period: <span className="num font-semibold text-ink">{a.summary.wastedByUnit.map((w) => `${w.quantity} ${w.unit}`).join(", ")}</span> (shown per unit type, since kilograms and pieces can't be added together).
            </p>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard
              title="Food wasted per month"
              description="Number of times food was thrown away"
              empty={a.monthly.every((m) => m.wasted === 0)}
              table={{ columns: ["Month", "Times wasted", "Est. cost"], rows: a.monthly.map((m) => [monthLabel(m.month), m.wasted, money(m.wastedCost, cur)]) }}
            >
              <SimpleBars data={a.monthly.map((m) => ({ month: monthLabel(m.month), wasted: m.wasted }))} xKey="month" yKey="wasted" color="var(--series-2)" valueLabel="Times wasted" />
            </ChartCard>

            <ChartCard
              title="Cost of wasted food per month"
              description={`Estimated, in ${cur}`}
              empty={a.monthly.every((m) => m.wastedCost === 0)}
              table={{ columns: ["Month", "Est. cost"], rows: a.monthly.map((m) => [monthLabel(m.month), money(m.wastedCost, cur)]) }}
            >
              <SimpleBars data={a.monthly.map((m) => ({ month: monthLabel(m.month), cost: m.wastedCost }))} xKey="month" yKey="cost" color="var(--series-2)" valueLabel={`Cost (${cur})`} />
            </ChartCard>

            <ChartCard
              className="lg:col-span-2"
              title="Pantry activity by week"
              description="Purchases added, food used and food wasted (number of records). The latest week is still in progress."
              empty={a.trend.every((t) => !t.added && !t.consumed && !t.wasted)}
              table={{ columns: ["Week starting", "Purchases", "Used", "Wasted"], rows: a.trend.map((t) => [fmtDate(t.week), t.added, t.consumed, t.wasted]) }}
            >
              <ActivityTrend data={a.trend.map((t) => ({ ...t, label: fmtDate(t.week).replace(/ \d{4}$/, "") }))} />
            </ChartCard>

            <ChartCard
              title="Most wasted items"
              empty={a.topWasted.length === 0}
              table={{ columns: ["Item", "Times", "Quantity", "Est. cost"], rows: a.topWasted.map((t) => [t.name, t.count, `${t.quantity} ${t.unit}`, t.costKnown ? money(t.estimatedCost, cur) : "—"]) }}
            >
              <SimpleBars data={a.topWasted} xKey="name" yKey="count" horizontal color="var(--series-2)" valueLabel="Times wasted" height={Math.max(160, a.topWasted.length * 34)} />
            </ChartCard>

            <ChartCard
              title="Why food was wasted"
              empty={a.wasteReasons.length === 0}
              table={{ columns: ["Reason", "Times"], rows: a.wasteReasons.map((r) => [reasonLabel(r.reason), r.count]) }}
            >
              <SimpleBars data={a.wasteReasons.map((r) => ({ reason: reasonLabel(r.reason), count: r.count }))} xKey="reason" yKey="count" horizontal color="var(--series-2)" valueLabel="Times" height={Math.max(160, a.wasteReasons.length * 34)} />
            </ChartCard>

            <ChartCard
              title="Most used items"
              empty={a.topConsumed.length === 0}
              table={{ columns: ["Item", "Times used", "Quantity"], rows: a.topConsumed.map((t) => [t.name, t.count, `${t.quantity} ${t.unit}`]) }}
            >
              <SimpleBars data={a.topConsumed} xKey="name" yKey="count" horizontal color="var(--series-3)" valueLabel="Times used" height={Math.max(160, a.topConsumed.length * 34)} />
            </ChartCard>

            <ChartCard
              title="Pantry status now"
              empty={a.statusBreakdown.every((s) => s.count === 0)}
              table={{ columns: ["Status", "Items"], rows: a.statusBreakdown.map((s) => [s.label, s.count]) }}
            >
              <StatusDonut data={a.statusBreakdown} />
            </ChartCard>

            <ChartCard
              className="lg:col-span-2"
              title="Inventory by category"
              description="Items per category right now"
              empty={a.categoryBreakdown.length === 0}
              table={{ columns: ["Category", "Items", "In stock", "Low stock", "Stock value"], rows: a.categoryBreakdown.map((c) => [c.category, c.items, c.inStock, c.lowStock, c.valueKnown ? money(c.value, cur) : "—"]) }}
            >
              <SimpleBars data={a.categoryBreakdown} xKey="category" yKey="items" valueLabel="Items" horizontal height={Math.max(180, a.categoryBreakdown.length * 30)} />
            </ChartCard>
          </div>
        </div>
      )}
    </>
  );
}
