

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * CSV Export for Reports
 * GET/POST /api/reports/export/csv
 *
 * Supported inputs (query or JSON body):
 *  - month: YYYY-MM (preferred)
 *  - from:  YYYY-MM-DD
 *  - to:    YYYY-MM-DD
 *  - sep:   "," or ";"  (CSV separator; default ",")
 *
 * Output: text/csv with three sections
 *  1) Summary (income/expense/net)
 *  2) Category breakdown (expenses only)
 *  3) Top merchants (expenses only)
 */

function parseMonth(s?: string | null): { from: Date; to: Date } | null {
  if (!s || !/^\d{4}-\d{2}$/.test(s)) return null;
  const [y, m] = s.split("-").map(Number);
  const from = new Date(y, (m - 1), 1, 0, 0, 0, 0);
  const to = new Date(y, m, 0, 23, 59, 59, 999); // ayın son günü
  return { from, to };
}

function parseDay(s?: string | null): Date | null {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [_, y, mo, d] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  return Number.isFinite(dt.valueOf()) ? dt : null;
}

function toNumber(x: any): number { const n = Number(x); return Number.isFinite(n) ? n : 0; }

async function buildData(from: Date, to: Date) {
  const tx = await prisma.transaction.findMany({
    where: { occurredAt: { gte: from, lte: to } },
    select: { id: true, type: true, amount: true, occurredAt: true, merchant: true, categoryId: true },
    orderBy: { occurredAt: "asc" },
  });

  const catRows = await prisma.category.findMany({ select: { id: true, name: true, type: true } });
  const catMap = new Map<string, { name: string; type: string }>();
  for (const c of catRows) catMap.set(c.id, { name: c.name, type: c.type });

  let income = 0, expense = 0;
  const byCategory = new Map<string, number>();
  const byMerchant = new Map<string, number>();

  for (const t of tx) {
    const amt = toNumber(t.amount);
    const kind = String(t.type || "").toLowerCase();
    if (kind === "income") income += amt;
    else if (kind === "expense") {
      expense += amt;
      const catName = (t.categoryId && catMap.get(t.categoryId)?.name) || "(Diğer)";
      byCategory.set(catName, (byCategory.get(catName) || 0) + amt);
      const mer = (t.merchant || "").trim() || "(Diğer)";
      byMerchant.set(mer, (byMerchant.get(mer) || 0) + amt);
    }
  }

  const catList = Array.from(byCategory.entries()).map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
  const merList = Array.from(byMerchant.entries()).map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  return { income, expense, net: income - expense, catList, merList };
}

function csvEscape(x: string, sep: string) {
  const needs = x.includes("\n") || x.includes("\r") || x.includes("\"") || x.includes(sep);
  if (!needs) return x;
  return '"' + x.replace(/"/g, '""') + '"';
}

function toCSV({ income, expense, net, catList, merList }: Awaited<ReturnType<typeof buildData>>, sep = ",") {
  const lines: string[] = [];

  // Section 1: Summary
  lines.push(`# Summary`);
  lines.push(["Income", "Expense", "Net"].join(sep));
  lines.push([income, expense, net].map((v) => String(Math.round(Number(v)))).join(sep));
  lines.push("");

  // Section 2: Categories (expenses)
  lines.push(`# Category Breakdown (Expenses)`);
  lines.push(["Category", "Total"].join(sep));
  for (const r of catList) {
    lines.push([csvEscape(r.name, sep), String(Math.round(Number(r.total)))].join(sep));
  }
  lines.push("");

  // Section 3: Top Merchants (expenses)
  lines.push(`# Top Merchants (Expenses)`);
  lines.push(["Merchant", "Total"].join(sep));
  for (const r of merList) {
    lines.push([csvEscape(r.name, sep), String(Math.round(Number(r.total)))].join(sep));
  }

  return lines.join("\n");
}

async function handle(req: NextRequest) {
  const url = new URL(req.url);
  let month = url.searchParams.get("month");
  let fromParam = url.searchParams.get("from");
  let toParam = url.searchParams.get("to");
  let sep = url.searchParams.get("sep") || ",";

  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    month = body?.month ?? month;
    fromParam = body?.from ?? fromParam;
    toParam = body?.to ?? toParam;
    sep = body?.sep ?? sep;
  }

  let range = parseMonth(month || undefined);
  if (!range) {
    const from = parseDay(fromParam);
    const to = parseDay(toParam);
    if (!from || !to) {
      // default: current month
      const today = new Date();
      const y = today.getFullYear();
      const m = today.getMonth();
      range = { from: new Date(y, m, 1, 0, 0, 0, 0), to: new Date(y, m + 1, 0, 23, 59, 59, 999) };
    } else {
      range = { from, to };
    }
  }

  const data = await buildData(range.from, range.to);
  const csv = toCSV(data, sep === ";" ? ";" : ",");

  // filename
  const y = range.from.getFullYear();
  const mm = String(range.from.getMonth() + 1).padStart(2, "0");
  const filename = `report_${y}-${mm}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${filename}`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }