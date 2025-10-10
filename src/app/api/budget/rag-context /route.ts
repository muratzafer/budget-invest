import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Budget RAG Context
 * GET/POST /api/budget/rag-context
 *
 * Inputs (query or JSON body):
 *  - month: YYYY-MM  (tercih edilen)
 *  - from, to: YYYY-MM-DD  (alternatif)
 *  - limit: number (default 10) → toplamlarda döndürülen liste sınırı
 *
 * Output (RAG için özetlenmiş bağlam):
 *  - range { from, to }
 *  - totals { income, expense, net, count }
 *  - topCategories: [{ name, total }]
 *  - topMerchants:  [{ name, total }]
 *  - trend12: [{ month, income, expense, net }]
 *  - recent: son işlemlerden küçük örnek [{ occurredAt, type, amount, currency, merchant, category }]
 */

function parseMonth(s?: string | null) {
  if (!s || !/^\d{4}-\d{2}$/.test(s)) return null;
  const [y, m] = s.split("-").map(Number);
  const from = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const to = new Date(y, m, 0, 23, 59, 59, 999);
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
function toNumber(x: any) { const n = Number(x); return Number.isFinite(n) ? n : 0; }
function ym(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999); }

async function buildContext(from: Date, to: Date, topN: number) {
  // çekilecek işlemler (seçilen aralık)
  const tx = await prisma.transaction.findMany({
    where: { occurredAt: { gte: from, lte: to } },
    select: { id: true, type: true, amount: true, currency: true, occurredAt: true, merchant: true, categoryId: true },
    orderBy: { occurredAt: "asc" },
  });

  // kategori isimleri
  const cats = await prisma.category.findMany({ select: { id: true, name: true, type: true } });
  const catMap = new Map(cats.map((c) => [c.id, c] as const));

  // toplamlar ve kırılımlar
  let income = 0, expense = 0;
  const byCat = new Map<string, number>();
  const byMer = new Map<string, number>();

  for (const t of tx) {
    const amt = toNumber(t.amount);
    if (t.type === "income") income += amt;
    else if (t.type === "expense") {
      expense += amt;
      const cname = t.categoryId ? (catMap.get(t.categoryId)?.name ?? "(Diğer)") : "(Diğer)";
      byCat.set(cname, (byCat.get(cname) || 0) + amt);
      const mer = (t.merchant || "").trim() || "(Diğer)";
      byMer.set(mer, (byMer.get(mer) || 0) + amt);
    }
  }

  const topCategories = Array.from(byCat.entries()).map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total).slice(0, topN);
  const topMerchants = Array.from(byMer.entries()).map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total).slice(0, topN);

  // son 12 ay trendi (aylık gelir/gider/net)
  const today = new Date();
  const months: { key: string; from: Date; to: Date; income: number; expense: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const base = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push({ key: ym(base), from: startOfMonth(base), to: endOfMonth(base), income: 0, expense: 0 });
  }
  const idx = new Map(months.map((m, i) => [m.key, i] as const));
  const tx12 = await prisma.transaction.findMany({
    where: { occurredAt: { gte: months[0].from, lte: months[months.length - 1].to } },
    select: { type: true, amount: true, occurredAt: true },
    orderBy: { occurredAt: "asc" },
  });
  for (const t of tx12) {
    const k = ym(new Date(t.occurredAt));
    const i = idx.get(k);
    if (i === undefined) continue;
    if (t.type === "income") months[i].income += toNumber(t.amount);
    else if (t.type === "expense") months[i].expense += toNumber(t.amount);
  }
  const trend12 = months.map((m) => ({ month: m.key, income: m.income, expense: m.expense, net: m.income - m.expense }));

  // küçük örnek: en son 10 işlem (özet alanlar)
  const recentRaw = await prisma.transaction.findMany({
    where: { occurredAt: { gte: from, lte: to } },
    select: { occurredAt: true, type: true, amount: true, currency: true, merchant: true, categoryId: true },
    orderBy: { occurredAt: "desc" },
    take: 10,
  });
  const recent = recentRaw.map((t) => ({
    occurredAt: (t.occurredAt instanceof Date ? t.occurredAt : new Date(t.occurredAt)).toISOString(),
    type: t.type,
    amount: toNumber(t.amount),
    currency: t.currency,
    merchant: t.merchant || null,
    category: t.categoryId ? (catMap.get(t.categoryId)?.name ?? null) : null,
  }));

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    totals: { income, expense, net: income - expense, count: tx.length },
    topCategories,
    topMerchants,
    trend12,
    recent,
  };
}

async function handle(req: NextRequest) {
  const url = new URL(req.url);
  let month = url.searchParams.get("month");
  let fromParam = url.searchParams.get("from");
  let toParam = url.searchParams.get("to");
  const limit = Math.max(3, Math.min(50, Number(url.searchParams.get("limit") || 10)));

  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    month = body?.month ?? month;
    fromParam = body?.from ?? fromParam;
    toParam = body?.to ?? toParam;
  }

  let range = parseMonth(month || undefined);
  if (!range) {
    const from = parseDay(fromParam);
    const to = parseDay(toParam);
    if (from && to) range = { from, to };
  }
  if (!range) {
    const t = new Date();
    range = { from: startOfMonth(t), to: endOfMonth(t) };
  }

  const ctx = await buildContext(range.from, range.to, limit);
  return NextResponse.json({ ok: true, ...ctx });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }