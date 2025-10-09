

import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge"; // fast, no prisma here

/**
 * POST /api/ai/explain
 * Body example:
 * {
 *   "text": "Bu ay giderlerim neden arttı?",
 *   "context": { month: "2025-09", totals: { income: 42000, expense: 31500, net: 10500 } },
 *   "tone": "neutral",
 *   "language": "tr"
 * }
 */

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function ruleBasedExplain({ text, context, language = "tr" }: { text: string; context?: any; language?: string }) {
  const lang = (language || "tr").toLowerCase();
  const L = (tr: string, en: string) => (lang.startsWith("tr") ? tr : en);

  const month = context?.month || L("bu ay", "this month");
  const income = Number(context?.totals?.income ?? 0);
  const expense = Number(context?.totals?.expense ?? 0);
  const net = Number(context?.totals?.net ?? income - expense);

  const lines: string[] = [];
  lines.push(L(`• ${month} için özet: gelir ${income.toLocaleString("tr-TR")}, gider ${expense.toLocaleString("tr-TR")}, net ${net.toLocaleString("tr-TR")}.`,
               `• Summary for ${month}: income ${income.toLocaleString("en-US")}, expense ${expense.toLocaleString("en-US")}, net ${net.toLocaleString("en-US")}.`));

  if (expense > income) {
    lines.push(L("• Gider gelirden yüksek. Sabit giderleri ve büyük tek seferlik kalemleri gözden geçirin.",
                 "• Expenses exceed income. Review fixed costs and large one-off items."));
  } else if (net > 0) {
    lines.push(L("• Net pozitif. Bir kısmını acil durum fonu veya DCA planlarına ayırabilirsiniz.",
                 "• Positive net. Consider allocating part to emergency fund or DCA plans."));
  }

  if (Array.isArray(context?.topCategories) && context.topCategories.length) {
    const top = [...context.topCategories].sort((a: any, b: any) => Number(b.expense) - Number(a.expense))[0];
    const share = income + expense > 0 ? (Number(top.expense) / Math.max(1, Number(context?.totals?.expense || 0))) * 100 : 0;
    lines.push(L(`• En yüksek harcama kategorisi: ${top.name} (~%${share.toFixed(1)}).`,
                 `• Top spending category: ${top.name} (~${share.toFixed(1)}%).`));
  }

  if (Array.isArray(context?.topMerchants) && context.topMerchants.length) {
    const topM = [...context.topMerchants].sort((a: any, b: any) => Number(b.expense) - Number(a.expense))[0];
    lines.push(L(`• En çok ödeme yapılan işletme: ${topM.name}.`,
                 `• Top merchant: ${topM.name}.`));
  }

  lines.push(L("• Not: Bu açıklama AI kapalıyken kural tabanlı üretilmiştir.", "• Note: AI key missing, this is rule‑based."));

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = String(body?.text || "").slice(0, 4000);
    const context = body?.context || {};
    const tone = String(body?.tone || "neutral");
    const language = String(body?.language || "tr");
    const maxTokens = clamp(Number(body?.max_tokens ?? 360), 60, 1200);

    if (!text && !context) {
      return NextResponse.json({ ok: false, error: "missing text/context" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const summary = ruleBasedExplain({ text, context, language });
      return NextResponse.json({ ok: true, source: "rule", summary });
    }

    // --- OpenAI branch ---
    const sys = [
      {
        role: "system",
        content: `You are a helpful financial analyst. Write concise, actionable explanations. Tone: ${tone}. Language: ${language}. Use bullet points; avoid fluff.`,
      },
    ];
    const usr = [
      {
        role: "user",
        content: [
          { type: "text", text: `Question: ${text || "Explain the monthly report."}` },
          { type: "text", text: `Context JSON: ${JSON.stringify(context).slice(0, 8000)}` },
        ],
      } as any,
    ];

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [...sys, ...usr],
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
    });

    if (!res.ok) {
      // fallback to rule-based on any API failure
      const rb = ruleBasedExplain({ text, context, language });
      return NextResponse.json({ ok: true, source: "fallback", summary: rb, note: `openai_error_${res.status}` });
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const summary = String(content).trim();

    return NextResponse.json({ ok: true, source: "openai", summary });
  } catch (err) {
    console.error("/api/ai/explain POST error", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, info: "POST text/context to get an explanation." });
}