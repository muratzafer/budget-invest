import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

async function buildSummary(from: Date, to: Date, topN: number) {
  const tx = await prisma.transaction.findMany({
    where: { occurredAt: { gte: from, lte: to } },
    select: { id: true, type: true, amount: true, occurredAt: true, merchant: true, categoryId: true },
    orderBy: { occurredAt: "asc" },
  });

  const cats = await prisma.category.findMany({ select: { id: true, name: true, type: true } });
  const catMap = new Map(cats.map(c => [c.id, c]));

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
  const categories = Array.from(byCat.entries()).map(([name, total]) => ({ name, total }))
    .sort((a,b)=>b.total-a.total).slice(0, topN);
  const merchants = Array.from(byMer.entries()).map(([name, total]) => ({ name, total }))
    .sort((a,b)=>b.total-a.total).slice(0, topN);

  // Son 12 ay trend
  const today = new Date();
  const months: { key: string, from: Date, to: Date, income: number, expense: number }[] = [];
  for (let i=11;i>=0;i--) {
    const base = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push({ key: ym(base), from: startOfMonth(base), to: endOfMonth(base), income: 0, expense: 0 });
  }
  const idx = new Map(months.map((m,i)=>[m.key,i] as const));
  const tx12 = await prisma.transaction.findMany({
    where: { occurredAt: { gte: months[0].from, lte: months[months.length-1].to } },
    select: { type: true, amount: true, occurredAt: true },
    orderBy: { occurredAt: "asc" },
  });
  for (const t of tx12) {
    const k = ym(new Date(t.occurredAt));
    const i = idx.get(k);
    if (i===undefined) continue;
    if (t.type === "income") months[i].income += toNumber(t.amount);
    else if (t.type === "expense") months[i].expense += toNumber(t.amount);
  }
  const trend12 = months.map(m => ({ month: m.key, income: m.income, expense: m.expense, net: m.income - m.expense }));

  // Basit forecast: son 3 ay ortalaması
  const last3 = trend12.slice(-3);
  const avgInc = last3.length ? last3.reduce((a,x)=>a+x.income,0)/last3.length : 0;
  const avgExp = last3.length ? last3.reduce((a,x)=>a+x.expense,0)/last3.length : 0;
  const fwd = [];
  const last = months[months.length-1].from;
  for (let i=1;i<=3;i++) {
    const d = new Date(last.getFullYear(), last.getMonth()+i, 1);
    const key = ym(d);
    fwd.push({ month: key, expectedIncome: avgInc, expectedExpense: avgExp, expectedNet: avgInc - avgExp });
  }

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    totals: { income, expense, net: income - expense, count: tx.length },
    categories,
    merchants,
    trend12,
    forecast: fwd,
  };
}

async function handle(req: NextRequest) {
  const url = new URL(req.url, process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000");
  const top = Math.max(3, Math.min(50, Number(url.searchParams.get("top") || 10)));
  let month = url.searchParams.get("month");
  let range = parseMonth(month || undefined);
  if (!range) {
    const from = parseDay(url.searchParams.get("from"));
    const to = parseDay(url.searchParams.get("to"));
    if (from && to) range = { from, to };
  }
  if (!range) {
    const t = new Date();
    range = { from: startOfMonth(t), to: endOfMonth(t) };
  }
  const data = await buildSummary(range.from, range.to, top);
  return NextResponse.json({ ok: true, ...data });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }