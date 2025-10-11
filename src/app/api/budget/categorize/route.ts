import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

/**
 * POST /api/budget/categorize
 * Kategori öneri endpoint'i (Rule → AI → Heuristic sırası)
 *
 * Body örnekleri:
 * 1) Transaction id'leriyle:
 *    { "ids": ["tx_1", "tx_2"], "strategy": "rule-first", "apply": false }
 *
 * 2) Ham kayıtlarla:
 *    { "items": [{"merchant":"Migros", "description":"market", "amount":350}], "apply": false }
 *
 * Opsiyonel:
 *    - strategy: "rule-first" | "rule-only" | "ai-only" (default: rule-first)
 *    - threshold: 0..1 (default: process.env.NEXT_PUBLIC_ML_CONF_THRESHOLD || 0.35)
 *    - apply: true/false → eşik üstündeyse Transaction.categoryId günceller (yalnız ids ile)
 *    - saveRules: true/false → yüksek güvenli önerilerden Rule üretir (merchant pattern'i ile)
 */

type Suggestion = {
  id: string | null;
  merchant: string | null;
  description: string | null;
  amount?: number | null;
  categoryId: string | null;
  categoryName: string | null;
  source: "rule" | "ai" | "heuristic";
  confidence: number; // 0..1
  reason?: string;
  ruleId?: string;
};

const CONF_DEFAULT = Number(process.env.NEXT_PUBLIC_ML_CONF_THRESHOLD ?? 0.35);

function safeLower(x?: string | null) {
  return (x || "").toString().toLowerCase();
}

function compileRules(rules: Array<{ id: string; pattern: string; isRegex: boolean; priority: number; merchantOnly: boolean; categoryId: string }>) {
  return rules
    .map((r) => {
      let regex: RegExp | null = null;
      if (r.isRegex) {
        try { regex = new RegExp(r.pattern, "i"); } catch { regex = null; }
      }
      return { ...r, regex };
    })
    .sort((a, b) => a.priority - b.priority || b.pattern.length - a.pattern.length);
}

function matchByRule(
  rules: ReturnType<typeof compileRules>,
  merchant: string | null,
  description: string | null
): { rule?: (typeof rules)[number]; matched: boolean } {
  const m = safeLower(merchant);
  const d = safeLower(description);
  const hay = (m + " " + d).trim();

  for (const r of rules) {
    const target = r.merchantOnly ? m : hay;
    if (!target) continue;
    if (r.regex) {
      if (r.regex.test(target)) return { rule: r, matched: true };
    } else {
      if (safeLower(r.pattern) && target.includes(safeLower(r.pattern))) return { rule: r, matched: true };
    }
  }
  return { matched: false };
}

function heuristicSuggest(
  merchant: string | null,
  description: string | null,
  categories: Array<{ id: string; name: string; type: string }>
): { categoryId: string | null; categoryName: string | null; reason: string; confidence: number } {
  const text = `${safeLower(merchant)} ${safeLower(description)}`;
  const dict: Array<{ keys: string[]; name: string; conf: number }> = [
    { keys: ["migros", "bim", "a101", "şok", "carrefour"], name: "Market", conf: 0.65 },
    { keys: ["hepsiburada", "trendyol", "n11", "amazon"], name: "Online Alışveriş", conf: 0.6 },
    { keys: ["shell", "opet", "bp", "total", "petrol"], name: "Yakıt", conf: 0.7 },
    { keys: ["starbucks", "kahve", "cafe", "kafe"], name: "Kafe", conf: 0.55 },
    { keys: ["eczane", "hospital", "hastane", "ilaç"], name: "Sağlık", conf: 0.7 },
    { keys: ["türk telekom", "turkcell", "vodafone", "internet", "fatura"], name: "İletişim", conf: 0.55 },
    { keys: ["restoran", "lokanta", "yemeksepeti", "getir yemek"], name: "Yeme-İçme", conf: 0.6 },
    { keys: ["uber", "taksi", "istanbulkart", "metro", "otobüs"], name: "Ulaşım", conf: 0.55 },
  ];
  for (const row of dict) {
    if (row.keys.some((k) => text.includes(k))) {
      const hit = categories.find((c) => safeLower(c.name) === safeLower(row.name));
      if (hit) return { categoryId: hit.id, categoryName: hit.name, reason: `keyword→${row.name}`, confidence: row.conf };
    }
  }
  return { categoryId: null, categoryName: null, reason: "no-heuristic", confidence: 0.2 };
}

async function aiSuggest(
  openai: OpenAI | null,
  merchant: string | null,
  description: string | null,
  categories: Array<{ id: string; name: string; type: string }>
): Promise<{ categoryId: string | null; categoryName: string | null; reason: string; confidence: number }> {
  if (!openai) return { categoryId: null, categoryName: null, reason: "ai-disabled", confidence: 0.0 };
  const names = categories.map((c) => c.name);
  const prompt = `Aşağıdaki işlem için en uygun kategori adını bu listeden BİREBİR döndür: ${names.join(", ")}.\n\n` +
    `Merchant: ${merchant || "(yok)"}\nAçıklama: ${description || "(yok)"}\nYanıt formatı: sadece kategori adı, başka hiçbir şey değil.`;
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 20,
      messages: [
        { role: "system", content: "Kullanıcının finans harcama kategorisini yalnızca verilen seçeneklerden birini seçerek döndür." },
        { role: "user", content: prompt },
      ],
    });
    const text = (res.choices?.[0]?.message?.content || "").trim();
    const match = categories.find((c) => safeLower(c.name) === safeLower(text));
    if (match) return { categoryId: match.id, categoryName: match.name, reason: "openai", confidence: 0.8 };
    return { categoryId: null, categoryName: null, reason: `openai-unmapped(${text})`, confidence: 0.0 };
  } catch (e) {
    console.error("aiSuggest error", e);
    return { categoryId: null, categoryName: null, reason: "openai-error", confidence: 0.0 };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.slice(0, 50) : [];
    const items: Array<{ merchant?: string; description?: string; amount?: number }> = Array.isArray(body?.items) ? body.items.slice(0, 50) : [];
    const mode = (body?.strategy as "rule-first" | "rule-only" | "ai-only") || "rule-first";
    const isRuleOnly = mode === "rule-only";
    const isAiOnly = mode === "ai-only";
    const threshold = Math.max(0, Math.min(1, Number(body?.threshold ?? CONF_DEFAULT)));
    const apply = Boolean(body?.apply);
    const saveRules = Boolean(body?.saveRules);

    // Kategori listesi (sadece expense ve income birlikte olabilir; isim eşleşmesi için hepsi)
    const categories = await prisma.category.findMany({ select: { id: true, name: true, type: true } });

    // Kural listesi (önce priority)
    const rulesRaw = await prisma.rule.findMany({
      select: { id: true, pattern: true, isRegex: true, priority: true, merchantOnly: true, categoryId: true },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
    const rules = compileRules(rulesRaw);

    // İncelenecek kayıtları hazırla
    let targets: Array<{ id: string | null; merchant: string | null; description: string | null; amount?: number | null }> = [];
    if (ids.length) {
      const tx = await prisma.transaction.findMany({
        where: { id: { in: ids } },
        select: { id: true, merchant: true, description: true, amount: true },
      });
      targets = tx.map((t) => ({ id: t.id, merchant: t.merchant, description: t.description, amount: Number(t.amount) }));
    }
    if (items.length) {
      targets = targets.concat(items.map((x) => ({ id: null, merchant: x.merchant ?? null, description: x.description ?? null, amount: x.amount ?? null })));
    }

    // OpenAI opsiyonel
    const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

    const suggestions: Suggestion[] = [];

    for (const t of targets) {
      const merchant = t.merchant || null;
      const description = t.description || null;

      // 1) Rule
      if (!isAiOnly) {
        const m = matchByRule(rules, merchant, description);
        if (m.matched && m.rule) {
          const cat = categories.find((c) => c.id === m.rule!.categoryId);
          if (cat) {
            suggestions.push({
              id: t.id,
              merchant,
              description,
              amount: t.amount ?? null,
              categoryId: cat.id,
              categoryName: cat.name,
              source: "rule",
              confidence: Math.min(0.99, 0.9 + Math.min(0.09, (m.rule.pattern?.length || 0) / 200)),
              reason: `rule:${m.rule.pattern}`,
              ruleId: m.rule.id,
            });
            continue; // rule bulunduysa diğerlerine bakma (rule-first / rule-only)
          }
        }
        if (isRuleOnly) {
          // kural yoksa ve yalnızca kural isteniyorsa
          suggestions.push({ id: t.id, merchant, description, amount: t.amount ?? null, categoryId: null, categoryName: null, source: "rule", confidence: 0, reason: "no-rule" });
          continue;
        }
      }

      // 2) AI
      let ai: Suggestion | null = null;
      if (!isRuleOnly) {
        const out = await aiSuggest(openai, merchant, description, categories);
        if (out.categoryId) {
          ai = {
            id: t.id,
            merchant,
            description,
            amount: t.amount ?? null,
            categoryId: out.categoryId,
            categoryName: out.categoryName,
            source: "ai",
            confidence: out.confidence,
            reason: out.reason,
          };
        }
      }

      // 3) Heuristic (AI başarısızsa)
      if (!ai) {
        const h = heuristicSuggest(merchant, description, categories);
        suggestions.push({
          id: t.id,
          merchant,
          description,
          amount: t.amount ?? null,
          categoryId: h.categoryId,
          categoryName: h.categoryName,
          source: "heuristic",
          confidence: h.confidence,
          reason: h.reason,
        });
      } else {
        suggestions.push(ai);
      }
    }

    let applied = 0;
    let createdRules: Array<{ id: string; pattern: string; categoryId: string }> = [];

    // İstenirse Transaction'lara uygula (yalnız id'li olanlar ve eşik üstü)
    if (apply && suggestions.length) {
      const okOnes = suggestions.filter((s) => s.id && s.categoryId && s.confidence >= threshold);
      for (const s of okOnes) {
        await prisma.transaction.update({ where: { id: s.id! }, data: { categoryId: s.categoryId! } });
        applied++;
      }
    }

    // İstenirse kural oluştur (yüksek güvenli önerilerden)
    if (saveRules) {
      const ruleCandidates = suggestions.filter((s) => (s.source === "rule" || s.source === "ai" || s.source === "heuristic") && s.categoryId && s.merchant && s.confidence >= Math.max(threshold, 0.7));
      for (const s of ruleCandidates) {
        const pat = s.merchant!.trim();
        if (!pat) continue;
        // Aynı pattern+category zaten varsa atla
        const exists = await prisma.rule.findFirst({ where: { pattern: pat, categoryId: s.categoryId! } });
        if (exists) continue;
        const r = await prisma.rule.create({
          data: {
            pattern: pat,
            isRegex: false,
            merchantOnly: true,
            priority: 50,
            categoryId: s.categoryId!,
          },
        });
        createdRules.push({ id: r.id, pattern: r.pattern, categoryId: r.categoryId });
      }
    }

    return NextResponse.json({ ok: true, threshold, suggestions, applied, createdRules });
  } catch (e: any) {
    console.error("/api/budget/categorize error", e);
    return NextResponse.json({ ok: false, error: e?.message || "failed" }, { status: 500 });
  }
}