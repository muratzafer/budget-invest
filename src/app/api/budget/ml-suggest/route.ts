

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

/**
 * POST /api/budget/ml-suggest
 * Basit ML/AI kategori tahmini (AI varsa AI → yoksa heuristik)
 *
 * Body örnekleri:
 *  { merchant: "Migros", description: "market alışverişi", amount: 350 }
 *  { items: [{ merchant, description, amount }, ...] }
 *  { strategy: "ai-first" | "heuristic-only" } (default: ai-first)
 *  { threshold: 0..1 } (opsiyonel; sadece bilgi amaçlı döner)
 */

type InItem = { merchant?: string | null; description?: string | null; amount?: number | null };

type OutItem = {
  merchant: string | null;
  description: string | null;
  amount: number | null;
  categoryId: string | null;
  categoryName: string | null;
  confidence: number; // 0..1
  source: "ai" | "heuristic";
  reason?: string;
};

const CONF_DEFAULT = Number(process.env.NEXT_PUBLIC_ML_CONF_THRESHOLD ?? 0.35);

function safeLower(x?: string | null) { return (x || "").toString().toLowerCase(); }

function heuristicSuggest(
  merchant: string | null,
  description: string | null,
  categories: Array<{ id: string; name: string; type: string }>
): { categoryId: string | null; categoryName: string | null; confidence: number; reason: string } {
  const text = `${safeLower(merchant)} ${safeLower(description)}`;
  const dict: Array<{ keys: string[]; name: string; conf: number }> = [
    { keys: ["migros", "bim", "a101", "şok", "carrefour"], name: "Market", conf: 0.65 },
    { keys: ["hepsiburada", "trendyol", "n11", "amazon"], name: "Online Alışveriş", conf: 0.6 },
    { keys: ["shell", "opet", "bp", "total", "petrol"], name: "Yakıt", conf: 0.7 },
    { keys: ["starbucks", "kahve", "cafe", "kafe"], name: "Kafe", conf: 0.55 },
    { keys: ["eczane", "hospital", "hastane", "ilaç"], name: "Sağlık", conf: 0.7 },
    { keys: ["turk telekom", "türk telekom", "turkcell", "vodafone", "internet", "fatura"], name: "İletişim", conf: 0.55 },
    { keys: ["restoran", "lokanta", "yemeksepeti", "getir yemek", "getiryemek"], name: "Yeme-İçme", conf: 0.6 },
    { keys: ["uber", "taksi", "istanbulkart", "metro", "otobüs"], name: "Ulaşım", conf: 0.55 },
  ];
  for (const row of dict) {
    if (row.keys.some((k) => text.includes(k))) {
      const hit = categories.find((c) => safeLower(c.name) === safeLower(row.name));
      if (hit) return { categoryId: hit.id, categoryName: hit.name, confidence: row.conf, reason: `heuristic:${row.name}` };
    }
  }
  return { categoryId: null, categoryName: null, confidence: 0.2, reason: "heuristic:none" };
}

async function aiSuggest(
  openai: OpenAI | null,
  merchant: string | null,
  description: string | null,
  categories: Array<{ id: string; name: string; type: string }>
): Promise<{ categoryId: string | null; categoryName: string | null; confidence: number; reason: string }> {
  if (!openai) return { categoryId: null, categoryName: null, confidence: 0, reason: "ai:disabled" };
  const names = categories.map((c) => c.name);
  const prompt = `Aşağıdaki işlem için en uygun kategori adını bu listeden BİREBİR döndür: ${names.join(", ")}.\n\n` +
    `Merchant: ${merchant || "(yok)"}\nAçıklama: ${description || "(yok)"}\nYanıt formatı: sadece kategori adı, başka hiçbir şey yazma.`;
  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 20,
      messages: [
        { role: "system", content: "Kullanıcının finans harcama kategorisini yalnızca verilen seçeneklerden birini seçerek döndür." },
        { role: "user", content: prompt },
      ],
    });
    const text = (r.choices?.[0]?.message?.content || "").trim();
    const match = categories.find((c) => safeLower(c.name) === safeLower(text));
    if (match) return { categoryId: match.id, categoryName: match.name, confidence: 0.8, reason: "ai:gpt-4o-mini" };
    return { categoryId: null, categoryName: null, confidence: 0, reason: `ai:unmapped(${text})` };
  } catch (e) {
    console.error("ml-suggest aiSuggest error", e);
    return { categoryId: null, categoryName: null, confidence: 0, reason: "ai:error" };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const items: InItem[] = Array.isArray(body?.items)
      ? (body.items as InItem[]).slice(0, 100)
      : [{ merchant: body?.merchant ?? null, description: body?.description ?? null, amount: body?.amount ?? null }];

    const strategy: "ai-first" | "heuristic-only" = (body?.strategy as any) || "ai-first";
    const threshold = Math.max(0, Math.min(1, Number(body?.threshold ?? CONF_DEFAULT)));

    // Kategorileri çek (type fark etmeksizin isim eşleşmesi için hepsi)
    const categories = await prisma.category.findMany({ select: { id: true, name: true, type: true } });

    // OpenAI (opsiyonel)
    const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

    const outputs: OutItem[] = [];

    for (const it of items) {
      const m = it.merchant ?? null;
      const d = it.description ?? null;
      const amt = typeof it.amount === "number" ? it.amount : null;

      let out: OutItem | null = null;

      if (strategy !== "heuristic-only") {
        const ai = await aiSuggest(openai, m, d, categories);
        if (ai.categoryId) {
          out = { merchant: m, description: d, amount: amt, categoryId: ai.categoryId, categoryName: ai.categoryName, confidence: ai.confidence, source: "ai", reason: ai.reason };
        }
      }

      if (!out) {
        const h = heuristicSuggest(m, d, categories);
        out = { merchant: m, description: d, amount: amt, categoryId: h.categoryId, categoryName: h.categoryName, confidence: h.confidence, source: "heuristic", reason: h.reason };
      }

      outputs.push(out);
    }

    return NextResponse.json({ ok: true, threshold, items: outputs });
  } catch (e: any) {
    console.error("/api/budget/ml-suggest error", e);
    return NextResponse.json({ ok: false, error: e?.message || "failed" }, { status: 500 });
  }
}

export async function GET() {
  // basit sağlık kontrolü
  return NextResponse.json({ ok: true, model: process.env.OPENAI_API_KEY ? "openai:gpt-4o-mini" : "heuristic" });
}