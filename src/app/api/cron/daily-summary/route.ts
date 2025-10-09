import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Optional simple auth for cron calls
const CRON_TOKEN = process.env.CRON_TOKEN || process.env.CRON_SECRET || "";

async function aiSummarize(origin: string, payload: any) {
  try {
    const res = await fetch(`${origin}/api/ai/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) return null;
    return String(data.summary || "");
  } catch {
    return null;
  }
}

function parseDateOnly(s?: string | null) {
  if (!s) return null;
  // accept YYYY-MM-DD
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

export async function GET(req: NextRequest) {
  // This endpoint is designed for Vercel Cron (GET). It computes a daily summary
  // of transactions and returns JSON. If CRON_TOKEN is set, require `?token=`.
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || url.searchParams.get("secret");
    if (CRON_TOKEN && token !== CRON_TOKEN) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const dateStr = url.searchParams.get("date"); // YYYY-MM-DD (optional)
    const d = parseDateOnly(dateStr) || new Date();

    const from = startOfDay(d);
    const to = endOfDay(d);

    // Pull today's transactions
    const tx = await prisma.transaction.findMany({
      where: { occurredAt: { gte: from, lte: to } },
      select: {
        id: true,
        type: true,
        amount: true,
        currency: true,
        merchant: true,
        description: true,
        category: { select: { id: true, name: true, type: true } },
      },
      orderBy: { occurredAt: "asc" },
    });

    let income = 0;
    let expense = 0;

    const byCategory = new Map<string, { name: string; type?: string | null; total: number }>();
    const byMerchant = new Map<string, number>();

    for (const t of tx) {
      const amt = Number(t.amount);
      if (!Number.isFinite(amt)) continue;
      if ((t.type || "").toLowerCase() === "income") income += amt; else if ((t.type || "").toLowerCase() === "expense") expense += amt; // transfers ignored

      // group categories for expenses
      if ((t.type || "").toLowerCase() === "expense") {
        const key = t.category?.name || "(Diğer)";
        const prev = byCategory.get(key) || { name: key, type: t.category?.type, total: 0 };
        prev.total += amt;
        byCategory.set(key, prev);

        const mer = (t.merchant || "").trim() || "(Diğer)";
        byMerchant.set(mer, (byMerchant.get(mer) || 0) + amt);
      }
    }

    const net = income - expense;

    const topCategories = Array.from(byCategory.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map((c) => ({ name: c.name, expense: c.total }));

    const topMerchants = Array.from(byMerchant.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, expense]) => ({ name, expense }));

    // Optional AI summary
    let aiSummary: string | null = null;
    const wantAI = url.searchParams.get("ai") === "1";
    if (wantAI) {
      const origin = (req as any).nextUrl?.origin || `${url.protocol}//${url.host}`;
      aiSummary = await aiSummarize(origin, {
        text: "Bugünün işlemlerini özetle ve önemli noktaları kısaca açıkla.",
        language: "tr",
        tone: "neutral",
        context: {
          date: from.toISOString().slice(0, 10),
          totals: { income, expense, net },
          topCategories,
          topMerchants,
        },
      });
    }

    // Response only (no DB writes, to keep schema unchanged)
    return NextResponse.json({
      ok: true,
      date: from.toISOString().slice(0, 10),
      totals: { income, expense, net },
      counts: { transactions: tx.length },
      topCategories,
      topMerchants,
      summary: aiSummary ?? undefined,
    });
  } catch (err) {
    console.error("/api/cron/daily-summary GET error", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // Same as GET but allows JSON body with `date` and optional token.
  try {
    const body = await req.json().catch(() => ({}));
    const wantAI = Boolean(body?.ai);
    const token = body?.token || body?.secret;
    if (CRON_TOKEN && token !== CRON_TOKEN) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const dateStr: string | undefined = body?.date;
    const d = parseDateOnly(dateStr || null) || new Date();

    const url = new URL(req.url);
    // reuse GET logic by forging a new request URL with `date`
    url.searchParams.set("date", `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    if (wantAI) url.searchParams.set("ai", "1");
    if (CRON_TOKEN) url.searchParams.set("token", CRON_TOKEN);
    const proxyReq = new Request(url.toString(), { method: "GET", headers: req.headers });
    // @ts-ignore
    return GET(proxyReq);
  } catch (err) {
    console.error("/api/cron/daily-summary POST error", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}