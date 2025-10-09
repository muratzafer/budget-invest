

import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/reports/summary
 * Body (flexible):
 * {
 *   month: string;                 // "2025-09"
 *   totals?: { income?: number; expense?: number; net?: number };
 *   categories?: Array<{ name: string; expense: number }>;
 *   merchants?: Array<{ name: string; expense: number }>;
 *   sixMonth?: Array<{ month: string; income?: number; expense?: number; net?: number }>;
 * }
 */

function fmtCurrency(v: any, ccy: string) {
  const n = Number(v ?? 0);
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: ccy as any, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n)} ${ccy}`;
  }
}

function pct(a: number, b: number) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0;
  return (a / b) * 100;
}

function diffPct(a: number, b: number) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0;
  return ((a - b) / Math.abs(b)) * 100;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const currency = String(body?.currency || "TRY");
    const month = String(body?.month || "Bu Ay");
    const totals = body?.totals || {};
    const categories = Array.isArray(body?.categories) ? body.categories : [];
    const merchants = Array.isArray(body?.merchants) ? body.merchants : [];
    const sixMonth = Array.isArray(body?.sixMonth) ? body.sixMonth : [];

    const income = Number(totals?.income ?? 0);
    const expense = Number(totals?.expense ?? 0);
    const net = Number(totals?.net ?? (income - expense));

    // compute previous month if available
    let prevIncome = 0, prevExpense = 0, prevNet = 0;
    if (sixMonth.length >= 2) {
      const ordered = [...sixMonth].sort((a, b) => String(a.month).localeCompare(String(b.month)));
      const last = ordered[ordered.length - 1];
      const prev = ordered[ordered.length - 2];
      prevIncome = Number(prev?.income ?? 0);
      prevExpense = Number(prev?.expense ?? 0);
      prevNet = Number(prev?.net ?? (prevIncome - prevExpense));
    }

    const savingsRate = pct(net, income);
    const momIncome = diffPct(income, prevIncome);
    const momExpense = diffPct(expense, prevExpense);
    const momNet = diffPct(net, prevNet);

    const topCat = [...categories].sort((a, b) => Number(b.expense) - Number(a.expense))[0];
    const topMer = [...merchants].sort((a, b) => Number(b.expense) - Number(a.expense))[0];

    // Trend (net) using simple averages
    let trendText = "";
    if (sixMonth.length >= 3) {
      const ordered = [...sixMonth].sort((a, b) => String(a.month).localeCompare(String(b.month)));
      const nets = ordered.map((m) => Number(m?.net ?? ((m.income ?? 0) - (m.expense ?? 0))));
      const half = Math.floor(nets.length / 2);
      const firstAvg = nets.slice(0, half).reduce((s, x) => s + x, 0) / Math.max(1, half);
      const lastAvg = nets.slice(half).reduce((s, x) => s + x, 0) / Math.max(1, nets.length - half);
      const trend = diffPct(lastAvg, firstAvg);
      trendText = `Net akış trendi son dönemde %${(trend || 0).toFixed(0)}.`;
    }

    const lines: string[] = [];
    lines.push(`**${month} Rapor Özeti**`);
    lines.push(`• Gelir: ${fmtCurrency(income, currency)}, Gider: ${fmtCurrency(expense, currency)}, Net: ${fmtCurrency(net, currency)}`);
    if (Number.isFinite(savingsRate)) lines.push(`• Tasarruf oranı: %${(savingsRate || 0).toFixed(1)}`);
    if (sixMonth.length >= 2) lines.push(`• Geçen aya göre: Gelir %${(momIncome || 0).toFixed(1)}, Gider %${(momExpense || 0).toFixed(1)}, Net %${(momNet || 0).toFixed(1)}`);
    if (topCat) lines.push(`• En yüksek harcama kategorisi: ${topCat.name} (giderin %${pct(Number(topCat.expense||0), expense).toFixed(1)})`);
    if (topMer) lines.push(`• En çok ödeme yapılan işletme: ${topMer.name}`);
    if (trendText) lines.push(`• ${trendText}`);
    if (expense > income) lines.push(`• Uyarı: Bu ay gider gelirden yüksek – bütçe optimizasyonu önerilir.`);

    const text = lines.join("\n");

    return NextResponse.json({ ok: true, summary: text });
  } catch (err) {
    console.error("/api/reports/summary POST error", err);
    return NextResponse.json({ ok: false, error: "Summary could not be generated" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Use POST" }, { status: 405 });
}