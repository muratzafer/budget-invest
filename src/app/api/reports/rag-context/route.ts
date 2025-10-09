

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * RAG Context Builder
 * GET/POST /api/reports/rag-context
 *
 * Query/body (optional):
 *  - from: YYYY-MM-DD (default: today-90d)
 *  - to:   YYYY-MM-DD (default: today)
 *  - limit: number (top-N lists, default 10)
 *
 * Response JSON includes:
 *  - range { from, to }
 *  - totals { income, expense, net, count }
 *  - topCategories: [{ name, expense }]
 *  - topMerchants:  [{ name, expense }]
 *  - holdings: {
 *      totalMarket, totalBook, totalPnl,
 *      top: [{ symbol, qty, avgCost, last, mv, pnl }]
 *    }
 *  - targets: [{ symbol, targetPct }]
 *  - dcaPlans: [{ id, name, symbol, amount, period, status, nextRunAt }]
 */

function parseDay(s?: string | null): Date | null {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [_, y, mo, d] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  return Number.isFinite(dt.valueOf()) ? dt : null;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function toNumber(x: any): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

async function buildContext(from: Date, to: Date, topLimit: number) {
  const tx = await prisma.transaction.findMany({
    where: { occurredAt: { gte: from, lte: to } },
    select: {
      id: true,
      type: true,
      amount: true,
      currency: true,
      merchant: true,
      category: { select: { id: true, name: true, type: true } },
    },
    orderBy: { occurredAt: "asc" },
  });

  let income = 0,
    expense = 0;
  const byCategory = new Map<string, { name: string; total: number }>();
  const byMerchant = new Map<string, number>();

  for (const t of tx) {
    const amt = toNumber(t.amount);
    const kind = String(t.type || "").toLowerCase();
    if (kind === "income") income += amt;
    else if (kind === "expense") {
      expense += amt;
      const cat = t.category?.name || "(Diğer)";
      const prev = byCategory.get(cat) || { name: cat, total: 0 };
      prev.total += amt;
      byCategory.set(cat, prev);
      const mer = (t.merchant || "").trim() || "(Diğer)";
      byMerchant.set(mer, (byMerchant.get(mer) || 0) + amt);
    }
  }

  const topCategories = Array.from(byCategory.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, topLimit)
    .map((c) => ({ name: c.name, expense: c.total }));

  const topMerchants = Array.from(byMerchant.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topLimit)
    .map(([name, expense]) => ({ name, expense }));

  const holdings = await prisma.holding.findMany({
    select: { id: true, symbol: true, quantity: true, avgCost: true },
    orderBy: { createdAt: "asc" },
  });

  const symbols = Array.from(new Set(holdings.map((h) => h.symbol))).filter(Boolean);
  let latestPriceBySymbol = new Map<string, number>();
  if (symbols.length) {
    const latest = await prisma.price.findMany({
      where: { symbol: { in: symbols } },
      orderBy: { asOf: "desc" },
      distinct: ["symbol"],
      select: { symbol: true, price: true },
    });
    for (const p of latest) latestPriceBySymbol.set(p.symbol, Number(p.price));
  }

  let totalMarket = 0,
    totalBook = 0;
  const holdingRows = holdings
    .map((h) => {
      const qty = toNumber(h.quantity);
      const avg = toNumber(h.avgCost);
      const last = latestPriceBySymbol.get(h.symbol) ?? avg;
      const mv = qty * last;
      const book = qty * avg;
      totalMarket += mv;
      totalBook += book;
      return { symbol: h.symbol, qty, avgCost: avg, last, mv, pnl: mv - book };
    })
    .sort((a, b) => b.mv - a.mv)
    .slice(0, topLimit);

  const holdingsSummary = {
    totalMarket,
    totalBook,
    totalPnl: totalMarket - totalBook,
    top: holdingRows,
  };

  const targetsRaw = await prisma.targetAllocation.findMany({
    orderBy: { createdAt: "desc" },
  });
  const seen = new Set<string>();
  const targets = [] as Array<{ symbol: string; targetPct: number }>;
  for (const t of targetsRaw) {
    const sym = t.symbol;
    if (seen.has(sym)) continue;
    seen.add(sym);
    targets.push({ symbol: sym, targetPct: Number(t.targetPct) });
  }

  const dcaPlans = await prisma.dCAPlan.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      symbol: true,
      amount: true,
      period: true,
      status: true,
      nextRunAt: true,
    },
    take: topLimit,
  });

  return {
    range: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
    totals: { income, expense, net: income - expense, count: tx.length },
    topCategories,
    topMerchants,
    holdings: holdingsSummary,
    targets,
    dcaPlans,
  };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") || 10)));
    const to = parseDay(url.searchParams.get("to")) || new Date();
    const from = parseDay(url.searchParams.get("from")) || new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);

    const ctx = await buildContext(startOfDay(from), endOfDay(to), limit);
    return NextResponse.json({ ok: true, ...ctx });
  } catch (err) {
    console.error("/api/reports/rag-context GET error", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(50, Number(body?.limit || 10)));
    const to = parseDay(body?.to) || new Date();
    const from = parseDay(body?.from) || new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);

    const ctx = await buildContext(startOfDay(from), endOfDay(to), limit);
    return NextResponse.json({ ok: true, ...ctx });
  } catch (err) {
    console.error("/api/reports/rag-context POST error", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}