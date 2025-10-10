

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";

/**
 * Budget RAG Analyze — context verilerini alır, OpenAI ile özet oluşturur
 * Input: { month?: string, from?: string, to?: string, question?: string }
 * Output: { ok: true, summary, answer }
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { month, from, to, question } = body ?? {};

    // 1️⃣ RAG Context çek
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/budget/rag-context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, from, to, limit: 10 }),
      cache: "no-store",
    });

    const ctx = await res.json();
    if (!ctx?.ok) throw new Error("RAG context alınamadı");

    const { totals, topCategories, topMerchants, trend12 } = ctx;

    // 2️⃣ Prompt oluştur
    const contextText = `
      GELİR-GİDER ÖZETİ
      Dönem: ${ctx.range.from} → ${ctx.range.to}
      Toplam gelir: ${totals.income.toFixed(2)} ${"TRY"}
      Toplam gider: ${totals.expense.toFixed(2)} ${"TRY"}
      Net: ${(totals.income - totals.expense).toFixed(2)} ${"TRY"}

      En çok harcama yapılan kategoriler:
      ${topCategories.map((c: any) => `• ${c.name}: ${c.total.toFixed(2)} TRY`).join("\n")}

      En çok harcama yapılan merchantlar:
      ${topMerchants.map((m: any) => `• ${m.name}: ${m.total.toFixed(2)} TRY`).join("\n")}

      12 Aylık Trend:
      ${trend12.map((t: any) => `${t.month}: Gelir ${t.income.toFixed(0)}, Gider ${t.expense.toFixed(0)}, Net ${(t.net).toFixed(0)}`).join("\n")}
    `;

    const userQuestion = question?.trim() || "Bu dönemdeki harcama ve gelir performansını özetle.";

    // 3️⃣ OpenAI çağrısı
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Sen bir finans analisti asistansın. Verilen aylık gelir-gider verilerini özetle, trend ve uyarıları belirt. Kısa ve analitik yaz.",
        },
        { role: "user", content: `${contextText}\n\nKullanıcı sorusu: ${userQuestion}` },
      ],
      temperature: 0.4,
      max_tokens: 400,
    });

    const summary = completion.choices?.[0]?.message?.content || "Yanıt alınamadı.";

    return NextResponse.json({ ok: true, summary, context: ctx });
  } catch (e: any) {
    console.error("/api/budget/rag-analyze hata:", e);
    return NextResponse.json({ ok: false, error: e.message || "Beklenmedik hata" }, { status: 500 });
  }
}