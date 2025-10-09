

import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge"; // orchestrates via fetch; no prisma here

/**
 * RAG Orchestrator
 * POST /api/reports/rag-analyze
 * Body (optional):
 * {
 *   from?: "YYYY-MM-DD",
 *   to?:   "YYYY-MM-DD",
 *   limit?: number,         // default 10 (top lists size)
 *   question?: string,      // user question for AI
 *   language?: "tr"|"en",
 *   tone?: "neutral"|"friendly"|"direct",
 *   currency?: "TRY"|"USD"|"EUR"
 * }
 *
 * It will:
 *  1) POST to /api/reports/rag-context with {from,to,limit}
 *  2) POST to /api/ai/explain with { text: question, context: <ctx>, tone, language }
 *  3) Return { ok, context, summary }
 */

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const from = body?.from as string | undefined;
    const to = body?.to as string | undefined;
    const limit = clamp(Number(body?.limit ?? 10), 3, 50);
    const question = String(body?.question || "Bu dönemi özetle ve önemli noktaları açıkla.");
    const language = String(body?.language || "tr");
    const tone = String(body?.tone || "neutral");
    const currency = String(body?.currency || "TRY");

    const origin = req.nextUrl.origin;

    // 1) Build context
    const ctxRes = await fetch(`${origin}/api/reports/rag-context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, limit }),
      // don't cache; this is dynamic
      cache: "no-store",
    });
    const ctxData = await ctxRes.json();
    if (!ctxRes.ok || !ctxData?.ok) {
      return NextResponse.json({ ok: false, error: ctxData?.error || "context_failed" }, { status: 500 });
    }

    // 2) Ask AI to explain
    const explainRes = await fetch(`${origin}/api/ai/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: question,
        language,
        tone,
        context: { ...ctxData, currency },
      }),
      cache: "no-store",
    });
    const explainData = await explainRes.json();
    if (!explainRes.ok || !explainData?.ok) {
      // Still return context so UI can fallback
      return NextResponse.json({ ok: false, context: ctxData, error: explainData?.error || "explain_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, context: ctxData, summary: explainData.summary, source: explainData.source });
  } catch (err) {
    console.error("/api/reports/rag-analyze POST error", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  // Convenience for quick tests: allows query params
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from") || undefined;
    const to = url.searchParams.get("to") || undefined;
    const limit = url.searchParams.get("limit");
    const language = url.searchParams.get("language") || "tr";
    const tone = url.searchParams.get("tone") || "neutral";
    const q = url.searchParams.get("q") || "Bu dönemi özetle ve önemli noktaları açıkla.";

    const origin = req.nextUrl.origin;

    const ctxRes = await fetch(`${origin}/api/reports/rag-context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, limit: Number(limit || 10) }),
      cache: "no-store",
    });
    const ctxData = await ctxRes.json();
    if (!ctxRes.ok || !ctxData?.ok) {
      return NextResponse.json({ ok: false, error: ctxData?.error || "context_failed" }, { status: 500 });
    }

    const explainRes = await fetch(`${origin}/api/ai/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: q, language, tone, context: ctxData }),
      cache: "no-store",
    });
    const explainData = await explainRes.json();
    if (!explainRes.ok || !explainData?.ok) {
      return NextResponse.json({ ok: false, context: ctxData, error: explainData?.error || "explain_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, context: ctxData, summary: explainData.summary, source: explainData.source });
  } catch (err) {
    console.error("/api/reports/rag-analyze GET error", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}