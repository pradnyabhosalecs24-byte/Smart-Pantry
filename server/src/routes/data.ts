import { Router, type Response } from "express";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { num, prisma } from "../db.js";
import { toCsv } from "../lib/csv.js";
import { handler, parse } from "../lib/http.js";
import { describeDaysLeft } from "../lib/status.js";
import { requireOwner, uid } from "../middleware/auth.js";
import { computeAnalytics } from "../services/analytics.js";
import { buildBackup, restoreBackup } from "../services/backup.js";
import { commitImport, IMPORT_COLUMNS, previewImport } from "../services/importer.js";
import { byUrgency, getCtx, loadItemViews } from "../services/pantry.js";
import { parseRange } from "./insights.js";

export const dataRouter = Router();

const STATUS_LABEL: Record<string, string> = {
  SAFE: "Safe",
  EXPIRING: "Expiring soon",
  EXPIRED: "Expired",
  NO_DATE: "Date missing",
  NO_EXPIRY: "No expiry",
  OUT_OF_STOCK: "Out of stock",
};

function sendCsv(res: Response, filename: string, csv: string) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}

dataRouter.get(
  "/export/items.csv",
  handler(async (req, res) => {
    const ctx = await getCtx(uid(req));
    const items = (await loadItemViews(ctx)).sort(byUrgency);
    // One row per batch so expiry dates and costs are preserved exactly
    const rows = items.flatMap((i) => {
      const batches = i.batches.filter((b) => b.quantity > 0);
      const base = [i.name, i.brand, i.category.name, i.location.name];
      if (!batches.length) return [[...base, 0, i.unit, null, null, i.minStock, STATUS_LABEL[i.status], i.lowStock ? "Yes" : "No", null, i.noExpiry ? "yes" : "no", i.notes]];
      return batches.map((b) => [...base, b.quantity, i.unit, b.effectiveExpiry, b.purchaseDate, i.minStock, STATUS_LABEL[b.status], i.lowStock ? "Yes" : "No", b.cost, i.noExpiry ? "yes" : "no", i.notes]);
    });
    sendCsv(
      res,
      `pantry-${ctx.today}.csv`,
      toCsv(["name", "brand", "category", "location", "quantity", "unit", "expiryDate", "purchaseDate", "minStock", "status", "lowStock", "cost", "noExpiry", "notes"], rows),
    );
  }),
);

dataRouter.get(
  "/export/shopping.csv",
  handler(async (req, res) => {
    const userId = uid(req);
    const ctx = await getCtx(userId);
    const rows = await prisma.shoppingItem.findMany({ where: { userId }, orderBy: [{ status: "asc" }, { createdAt: "asc" }] });
    sendCsv(
      res,
      `shopping-list-${ctx.today}.csv`,
      toCsv(["name", "quantity", "unit", "status", "note", "addedOn"], rows.map((r) => [r.name, num(r.quantity), r.unit, r.status === "PENDING" ? "To buy" : "Bought", r.note, r.createdAt.toISOString().slice(0, 10)])),
    );
  }),
);

dataRouter.get(
  "/export/usage.csv",
  handler(async (req, res) => {
    const ctx = await getCtx(uid(req));
    const { from, to } = parseRange(ctx, req.query);
    const rows = await prisma.usageEvent.findMany({
      where: { userId: ctx.userId, occurredAt: { gte: new Date(`${from}T00:00:00Z`), lt: new Date(new Date(`${to}T00:00:00Z`).getTime() + 86_400_000) } },
      orderBy: { occurredAt: "asc" },
    });
    sendCsv(
      res,
      `consumption-waste-${from}-to-${to}.csv`,
      toCsv(
        ["date", "item", "category", "type", "quantity", "unit", "wasteReason", "estimatedCost", "note"],
        rows.map((r) => [r.occurredAt.toISOString().slice(0, 10), r.itemName, r.categoryName, r.type === "CONSUMED" ? "Consumed" : "Wasted", num(r.quantity), r.unit, r.reason, r.estimatedCost == null ? null : num(r.estimatedCost), r.note]),
      ),
    );
  }),
);

dataRouter.get(
  "/export/analytics.csv",
  handler(async (req, res) => {
    const ctx = await getCtx(uid(req));
    const { from, to } = parseRange(ctx, req.query);
    const a = await computeAnalytics(ctx, await loadItemViews(ctx), from, to);
    const rows: unknown[][] = [
      ["Report", `Smart Pantry analytics ${from} to ${to}`, "", "", ""],
      ["Note", `Costs are estimates in ${a.currency} and only include records that had a price`, "", "", ""],
      [],
      ["Month", "Consumed (records)", "Wasted (records)", "Wasted cost (est.)", "Purchase cost"],
      ...a.monthly.map((m) => [m.month, m.consumed, m.wasted, m.wastedCost, m.purchaseCost]),
      [],
      ["Most wasted item", "Times wasted", "Quantity", "Unit", "Estimated cost"],
      ...a.topWasted.map((t) => [t.name, t.count, t.quantity, t.unit, t.costKnown ? t.estimatedCost : ""]),
      [],
      ["Waste reason", "Count", "", "", ""],
      ...a.wasteReasons.map((r) => [r.reason, r.count, "", "", ""]),
      [],
      ["Category", "Items", "In stock", "Low stock", "Stock value (est.)"],
      ...a.categoryBreakdown.map((c) => [c.category, c.items, c.inStock, c.lowStock, c.valueKnown ? c.value : ""]),
    ];
    sendCsv(res, `analytics-${from}-to-${to}.csv`, toCsv(["Section", "A", "B", "C", "D"], rows));
  }),
);

/** Printable PDF summary. Uses currency codes (e.g. "INR") because built-in PDF fonts lack the ₹ glyph. */
dataRouter.get(
  "/export/report.pdf",
  handler(async (req, res) => {
    const ctx = await getCtx(uid(req));
    const { from, to } = parseRange(ctx, req.query);
    const items = await loadItemViews(ctx);
    const a = await computeAnalytics(ctx, items, from, to);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { name: true } });

    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: "Smart Pantry Report" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

    const green = "#2f6b3a";
    const money = (n: number) => `${a.currency} ${n.toFixed(2)}`;
    const heading = (t: string) => {
      doc.moveDown(0.8).fillColor(green).font("Helvetica-Bold").fontSize(13).text(t).moveDown(0.3).fillColor("#222").font("Helvetica").fontSize(10);
    };
    const table = (headers: string[], rows: (string | number)[][], widths: number[]) => {
      const x0 = doc.page.margins.left;
      const drawRow = (cells: (string | number)[], bold: boolean) => {
        if (doc.y > doc.page.height - 80) doc.addPage();
        const y = doc.y;
        let x = x0;
        doc.font(bold ? "Helvetica-Bold" : "Helvetica");
        cells.forEach((c, i) => {
          doc.text(String(c), x, y, { width: widths[i] - 6, ellipsis: true, lineBreak: false });
          x += widths[i];
        });
        doc.moveDown(0.35);
        doc.x = x0;
      };
      drawRow(headers, true);
      rows.forEach((r) => drawRow(r, false));
      if (!rows.length) doc.font("Helvetica-Oblique").text("No data for this period.").font("Helvetica");
    };

    doc.fillColor(green).font("Helvetica-Bold").fontSize(20).text("Smart Pantry Report");
    doc.fillColor("#555").font("Helvetica").fontSize(10).text(`${user.name} · ${from} to ${to} · generated ${ctx.today}`);

    heading("Pantry right now");
    table(["Status", "Items"], a.statusBreakdown.filter((s) => s.count > 0).map((s) => [s.label, s.count]), [200, 80]);
    doc.text(`Low-stock items: ${a.summary.lowStockItems}    Stock value (estimate): ${money(a.summary.stockValue)}`);

    heading("Needs attention");
    const urgent = items.filter((i) => i.status === "EXPIRED" || i.status === "EXPIRING").sort(byUrgency).slice(0, 15);
    table(["Item", "Qty", "Expiry", "Status"], urgent.map((i) => [i.name, `${i.quantity} ${i.unit}`, i.nextExpiry ?? "-", describeDaysLeft(i.daysLeft)]), [190, 90, 90, 130]);

    heading("Usage in this period");
    doc.text(`Consumed: ${a.summary.consumedEvents} records    Wasted: ${a.summary.wastedEvents} records    Waste rate: ${a.summary.wasteRate}%`);
    doc.text(
      `Estimated cost of wasted food: ${money(a.summary.wastedEstimatedCost)}${a.summary.wastedWithoutPrice ? ` (${a.summary.wastedWithoutPrice} record(s) had no price and are not included)` : ""}`,
    );
    if (a.summary.wastedByUnit.length) doc.text(`Wasted quantity: ${a.summary.wastedByUnit.map((w) => `${w.quantity} ${w.unit}`).join(", ")}`);

    heading("Monthly summary");
    table(["Month", "Consumed", "Wasted", "Wasted cost (est.)", "Purchases"], a.monthly.map((m) => [m.month, m.consumed, m.wasted, money(m.wastedCost), money(m.purchaseCost)]), [90, 80, 70, 130, 120]);

    heading("Most wasted items");
    table(["Item", "Times", "Quantity", "Est. cost"], a.topWasted.map((t) => [t.name, t.count, `${t.quantity} ${t.unit}`, t.costKnown ? money(t.estimatedCost) : "-"]), [190, 60, 120, 120]);

    doc.moveDown(1.5).fillColor("#777").fontSize(8).text("Costs are estimates based on the prices you entered. Expiry status follows the dates recorded in the app — always check food before eating it.");
    doc.end();

    const pdf = await done;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="pantry-report-${from}-to-${to}.pdf"`);
    res.send(pdf);
  }),
);

dataRouter.get(
  "/import/template.csv",
  handler(async (_req, res) => {
    sendCsv(
      res,
      "pantry-import-template.csv",
      toCsv([...IMPORT_COLUMNS], [
        ["Basmati Rice", "Grains & Cereals", "Pantry Shelf", 5, "kg", "2027-06-30", "2026-10-01", 1, "India Gate", 650, "no", ""],
        ["Rock Salt", "Spices & Condiments", "Kitchen Cabinet", 1, "kg", "", "2026-09-15", 0.25, "", 40, "yes", "Does not expire"],
      ]),
    );
  }),
);

const importBody = z.object({ csv: z.string().min(1, "The file is empty").max(1_000_000, "File is too large (max 1 MB)"), dryRun: z.boolean().default(true) });

dataRouter.post(
  "/import/items",
  handler(async (req, res) => {
    const body = parse(importBody, req.body);
    const ctx = await getCtx(uid(req));
    // The server re-validates on commit; it never trusts a preview sent back by the browser
    const preview = await previewImport(ctx, body.csv);
    const summary = {
      totalRows: preview.totalRows,
      validRows: preview.valid.length,
      errors: preview.errors,
      duplicates: preview.duplicates,
      addsToExisting: preview.addsToExisting,
      newCategories: preview.newCategories,
      newLocations: preview.newLocations,
      sample: preview.valid.slice(0, 10),
    };
    if (body.dryRun) {
      res.json({ dryRun: true, ...summary });
      return;
    }
    const result = await commitImport(ctx, preview);
    res.json({ dryRun: false, ...summary, ...result });
  }),
);

dataRouter.get(
  "/backup.json",
  handler(async (req, res) => {
    const userId = uid(req);
    const ctx = await getCtx(userId);
    res.setHeader("Content-Disposition", `attachment; filename="smart-pantry-backup-${ctx.today}.json"`);
    res.json(await buildBackup(userId));
  }),
);

dataRouter.post(
  "/restore",
  handler(async (req, res) => {
    const body = parse(z.object({ backup: z.unknown(), dryRun: z.boolean().default(true) }), req.body);
    requireOwner(req);
    res.json(await restoreBackup(uid(req), body.backup, body.dryRun));
  }),
);
