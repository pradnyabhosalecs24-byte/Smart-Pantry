import { Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { STATUS } from "../lib/status";
import type { ItemStatus } from "../lib/types";
import { Card, CardHeader, EmptyState } from "./ui";

/**
 * Every chart can switch to a plain table: colour is never the only way to read the data,
 * and the table works with screen readers and in print.
 */
export function ChartCard({
  title,
  description,
  table,
  empty,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  table: { columns: string[]; rows: (string | number)[][] };
  empty?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className={className}>
      <CardHeader
        title={title}
        description={description}
        action={
          !empty && (
            <button onClick={() => setAsTable((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-ink-2 hover:bg-oat hover:text-ink" aria-pressed={asTable}>
              <Table2 className="size-4" aria-hidden />
              {asTable ? "Show chart" : "Show table"}
            </button>
          )
        }
      />
      <div className="px-3 pb-4 sm:px-5">
        {empty ? (
          <EmptyState title="Nothing to show yet">Data appears here as you add items and record what you use or throw away.</EmptyState>
        ) : asTable ? (
          <div className="max-h-80 overflow-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2 text-left">
                <tr>
                  {table.columns.map((c) => (
                    <th key={c} scope="col" className="px-3 py-2 font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i} className="border-t border-line">
                    {r.map((cell, j) => (
                      <td key={j} className={`px-3 py-1.5 ${typeof cell === "number" ? "num" : ""}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </Card>
  );
}

const tooltipStyle = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--ink)", fontSize: 13 },
  labelStyle: { color: "var(--ink)", fontWeight: 600 },
  itemStyle: { color: "var(--ink-2)" },
  cursor: { fill: "var(--oat)" },
};

/** Status doughnut with a total in the middle and an always-visible labelled legend. */
export function StatusDonut({ data }: { data: { status: ItemStatus; label: string; count: number }[] }) {
  const shown = data.filter((d) => d.count > 0);
  const total = shown.reduce((s, d) => s + d.count, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative size-44 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={shown} dataKey="count" nameKey="label" innerRadius="66%" outerRadius="100%" paddingAngle={shown.length > 1 ? 2 : 0} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
              {shown.map((d) => (
                <Cell key={d.status} fill={STATUS[d.status].chart} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="num font-display text-3xl font-[650]">{total}</span>
          <span className="text-xs text-ink-2">items</span>
        </div>
      </div>
      <ul className="grid w-full gap-1.5 text-sm">
        {shown.map((d) => {
          const Icon = STATUS[d.status].icon;
          return (
            <li key={d.status} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: STATUS[d.status].chart }} aria-hidden />
              <Icon className={`size-4 ${STATUS[d.status].text}`} aria-hidden />
              <span className="flex-1 text-ink-2">{d.label}</span>
              <span className="num font-semibold">{d.count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Single-series bars (no legend needed: the card title names the series). */
export function SimpleBars({ data, xKey, yKey, color = "var(--basil)", horizontal, height = 240, valueLabel }: { data: object[]; xKey: string; yKey: string; color?: string; horizontal?: boolean; height?: number; valueLabel?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      {horizontal ? (
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey={xKey} width={140} tickLine={false} axisLine={false} interval={0} />
          <Tooltip {...tooltipStyle} formatter={(v) => [v as number, valueLabel ?? yKey]} />
          <Bar dataKey={yKey} fill={color} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} />
        </BarChart>
      ) : (
        <BarChart data={data} margin={{ left: -12, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey={xKey} tickLine={false} axisLine={{ stroke: "var(--line)" }} interval={0} angle={data.length > 6 ? -25 : 0} textAnchor={data.length > 6 ? "end" : "middle"} height={data.length > 6 ? 56 : 30} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
          <Tooltip {...tooltipStyle} formatter={(v) => [v as number, valueLabel ?? yKey]} />
          <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

/** Weekly activity: three series of the same unit (records), one axis, legend always shown. */
export function ActivityTrend({ data }: { data: { label: string; added: number; consumed: number; wasted: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ left: -12, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--line)" }} minTickGap={24} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
        <Tooltip {...tooltipStyle} cursor={{ stroke: "var(--line-strong)" }} />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 13, color: "var(--ink-2)" }} />
        <Line type="linear" dataKey="added" name="Purchases added" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        <Line type="linear" dataKey="wasted" name="Wasted" stroke="var(--series-2)" strokeWidth={2} strokeDasharray="5 3" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        <Line type="linear" dataKey="consumed" name="Used" stroke="var(--series-3)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
