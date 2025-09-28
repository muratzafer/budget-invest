import { prisma } from "./db";
import { mlSuggestCategoryId } from "./autoClassifier";

const ML_CONFIDENCE_THRESHOLD = 0.35; // öneri için alt eşik

/**
 * Kurallar ile eşleştir; eşleşmezse ML ile öner ve yeterli güven varsa ata.
 * Geriye categoryId, confidence (opsiyonel) ve source bilgisi döner.
 */
export async function classifyCategoryId(input: {
  description?: string | null;
  merchant?: string | null;
}): Promise<{ categoryId: string | null; confidence?: number; source?: "rule" | "ml" }> {
  const textDesc = (input.description ?? "").toLowerCase();
  const textMerchant = (input.merchant ?? "").toLowerCase();

  if (!textDesc && !textMerchant) return { categoryId: null };

  // 1) KURAL TABANLI
  const rules = await prisma.rule.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  for (const r of rules) {
    const haystack = r.merchantOnly ? textMerchant : `${textMerchant} ${textDesc}`.trim();
    if (!haystack) continue;

    let matched = false;
    if (r.isRegex) {
      try {
        matched = new RegExp(r.pattern, "i").test(haystack);
      } catch {
        matched = false; // hatalı regex kuralını sessiz geç
      }
    } else {
      matched = haystack.includes(r.pattern.toLowerCase());
    }

    if (matched) return { categoryId: r.categoryId, source: "rule" };
  }

  // 2) ML ÖNERİSİ (kural yoksa)
  try {
    const ml = await mlSuggestCategoryId({ description: input.description, merchant: input.merchant });
    if (ml.categoryId && (ml.confidence ?? 0) >= ML_CONFIDENCE_THRESHOLD) {
      return { categoryId: ml.categoryId, confidence: ml.confidence, source: "ml" };
    }
  } catch {
    // ML hatası durumunda kategori atamayı zorlamayalım
  }

  return { categoryId: null };
}