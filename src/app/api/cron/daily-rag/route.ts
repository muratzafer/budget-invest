    
import { NextRequest, NextResponse } from "next/server";

// Optional simple auth for cron calls (same as daily-summary)
const CRON_TOKEN = process.env.CRON_TOKEN || process.env.CRON_SECRET || "";

function parseDateOnly(s?: string | null) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [_, y, mo, d] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  return Number.isFinite(dt.valueOf()) ? dt : null;
}
function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0); }
function endOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999); }

async function callJson(url: string, body: any) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
    cache: "no-store",
  });
  const data = await res.json();
  return { ok: res.ok && !!data?.ok, data } as const;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || url.searchParams.get("secret");
    if (CRON_TOKEN && token !== CRON_TOKEN) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const dateStr = url.searchParams.get("date"); // YYYY-MM-DD (optional)
    const d = parseDateOnly(dateStr) || new Date();

    // Build a helpful range: last 30 days including selected date
    const to = endOfDay(d);
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const origin = (req as any).nextUrl?.origin || `${url.protocol}//${url.host}`;

    // 1) RAG context for the range
    const ctxRes = await callJson(`${origin}/api/reports/rag-context`, {
      from: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`,
      to: `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, "0")}-${String(to.getDate()).padStart(2, "0")}`,
      limit: Number(url.searchParams.get("limit") || 10),
    });
    if (!ctxRes.ok) {
      return NextResponse.json({ ok: false, error: ctxRes.data?.error || "rag_context_failed" }, { status: 500 });
    }

    // 2) Ask AI to explain with this context
    const explainRes = await callJson(`${origin}/api/ai/explain`, {
      text: "Bugünün finansal özeti: son 30 gün bağlamıyla önemli noktaları, riskleri ve fırsatları kısaca açıkla.",
      language: url.searchParams.get("language") || "tr",
      tone: url.searchParams.get("tone") || "neutral",
      context: {
        date: startOfDay(d).toISOString().slice(0, 10),
        ...ctxRes.data,
      },
    });

    if (!explainRes.ok) {
      return NextResponse.json({ ok: false, context: ctxRes.data, error: explainRes.data?.error || "explain_failed" }, { status: 500 });
    }

    const ctx: any = ctxRes.data || {};
    const counts = {
      transactions: Number(ctx?.totals?.count || 0),
      categories: Number(ctx?.topCategories?.length || 0),
      merchants: Number(ctx?.topMerchants?.length || 0),
      holdingsTop: Number(ctx?.holdings?.top?.length || 0),
      dcaPlans: Number(ctx?.dcaPlans?.length || 0),
    };

    return NextResponse.json({
      ok: true,
      date: startOfDay(d).toISOString().slice(0, 10),
      range: ctx?.range,
      counts,
      summary: String(explainRes.data?.summary || ""),
      source: explainRes.data?.source || "",
    });
  } catch (err) {
    console.error("/api/cron/daily-rag GET error", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = body?.token || body?.secret;
    if (CRON_TOKEN && token !== CRON_TOKEN) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const dateStr: string | undefined = body?.date; // YYYY-MM-DD
    const d = parseDateOnly(dateStr || null) || new Date();
    const limit = Number(body?.limit || 10);
    const language = String(body?.language || "tr");
    const tone = String(body?.tone || "neutral");

    const url = new URL(req.url);
    const origin = (req as any).nextUrl?.origin || `${url.protocol}//${url.host}`;

    const to = endOfDay(d);
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const ctxRes = await callJson(`${origin}/api/reports/rag-context`, {
      from: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`,
      to: `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, "0")}-${String(to.getDate()).padStart(2, "0")}`,
      limit,
    });
    if (!ctxRes.ok) {
      return NextResponse.json({ ok: false, error: ctxRes.data?.error || "rag_context_failed" }, { status: 500 });
    }

    const explainRes = await callJson(`${origin}/api/ai/explain`, {
      text: body?.question || "Bugünün finansal özeti: son 30 gün bağlamıyla önemli noktaları, riskleri ve fırsatları kısaca açıkla.",
      language,
      tone,
      context: { date: startOfDay(d).toISOString().slice(0, 10), ...ctxRes.data },
    });

    if (!explainRes.ok) {
      return NextResponse.json({ ok: false, context: ctxRes.data, error: explainRes.data?.error || "explain_failed" }, { status: 500 });
    }

    const ctx: any = ctxRes.data || {};
    const counts = {
      transactions: Number(ctx?.totals?.count || 0),
      categories: Number(ctx?.topCategories?.length || 0),
      merchants: Number(ctx?.topMerchants?.length || 0),
      holdingsTop: Number(ctx?.holdings?.top?.length || 0),
      dcaPlans: Number(ctx?.dcaPlans?.length || 0),
    };

    return NextResponse.json({
      ok: true,
      date: startOfDay(d).toISOString().slice(0, 10),
      range: ctx?.range,
      counts,
      summary: String(explainRes.data?.summary || ""),
      source: explainRes.data?.source || "",
    });
  } catch (err) {
    console.error("/api/cron/daily-rag POST error", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}