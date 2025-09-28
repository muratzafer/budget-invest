import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/rules/suggestions
 * Query params (optional):
 *  - take: number (default 500) -> kaç işlem üzerinde analiz yapılacak (en yeni N)
 *  - minCount: number (default 3) -> bir merchant için minimum örnek sayısı
 *  - minShare: number (default 0.7) -> en baskın kategorinin payı (0..1)
 *
 * Dönen veri:
 *  [
 *    {
 *      merchantPattern: "a101",
 *      suggestedCategoryId: "cat_...",
 *      suggestedCategoryName: "Market",
 *      share: 0.92,          // en baskın kategorinin payı
 *      count: 12,            // o kategoriye giden adet
 *      total: 13,            // merchant'ın toplam örnek sayısı
 *    },
 *    ...
 *  ]
 *
 * Notlar:
 *  - Sadece merchant ve categoryId dolu olan kayıtlar hesaba katılır.
 *  - Pattern exact (regex değil) önerilir. İsterseniz UI'da tek tıkla kural oluşturabilirsiniz.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const take = Math.max(50, Math.min(Number(url.searchParams.get("take") ?? "500"), 2000));
    const minCount = Math.max(1, Math.min(Number(url.searchParams.get("minCount") ?? "3"), 100));
    const minShare = Math.max(0.5, Math.min(Number(url.searchParams.get("minShare") ?? "0.7"), 0.99));

    // Son N işlemi çek (yalnızca GİDERLER ve merchant & category dolu olanlar)
    const rows = await prisma.transaction.findMany({
      where: {
        type: "expense",
        merchant: { not: null },
        categoryId: { not: null },
      },
      orderBy: [{ occurredAt: "desc" }],
      take,
      select: {
        merchant: true,
        categoryId: true,
        category: { select: { id: true, name: true } },
      },
    });

    // Var olan kuralları çek (exact pattern'leri elemek için)
    const rules = await prisma.rule.findMany({
      select: { pattern: true, isRegex: true, categoryId: true },
    });
    const existingExactRules = new Set(
      rules
        .filter((r: { isRegex: any; }) => !r.isRegex)
        .map((r: { pattern: string; categoryId: any; }) => `${r.pattern.trim().toLowerCase()}|${r.categoryId}`)
    );

    type Stat = { total: number; byCat: Map<string, { count: number; name: string | null }> };
    const byMerchant = new Map<string, Stat>();

    for (const r of rows) {
      const m = String(r.merchant ?? "").trim().toLowerCase();
      const c = r.categoryId as string;
      if (!m || !c) continue;

      if (!byMerchant.has(m)) byMerchant.set(m, { total: 0, byCat: new Map() });
      const stat = byMerchant.get(m)!;
      stat.total += 1;

      const cat = stat.byCat.get(c) ?? { count: 0, name: r.category?.name ?? null };
      cat.count += 1;
      stat.byCat.set(c, cat);
    }

    const suggestions: Array<{
      merchantPattern: string;
      suggestedCategoryId: string;
      suggestedCategoryName: string | null;
      share: number;
      count: number;
      total: number;
    }> = [];

    for (const [m, stat] of byMerchant.entries()) {
      if (stat.total < minCount) continue;

      // en baskın kategori
      let bestCat: { id: string; name: string | null; count: number } | null = null;
      for (const [cid, info] of stat.byCat.entries()) {
        if (!bestCat || info.count > bestCat.count) {
          bestCat = { id: cid, name: info.name ?? null, count: info.count };
        }
      }
      if (!bestCat) continue;

      const share = bestCat.count / stat.total;
      if (share < minShare) continue;

      // Zaten exact rule varsa atla
      if (existingExactRules.has(`${m}|${bestCat.id}`)) continue;

      suggestions.push({
        merchantPattern: m, // exact pattern önerisi
        suggestedCategoryId: bestCat.id,
        suggestedCategoryName: bestCat.name,
        share: Number(share.toFixed(4)),
        count: bestCat.count,
        total: stat.total,
      });
    }

    // Sırala: pay -> count azalan
    suggestions.sort((a, b) => (b.share - a.share) || (b.count - a.count));

    return NextResponse.json(suggestions);
  } catch (err: any) {
    console.error("[rules/suggestions][GET]", err);
    return NextResponse.json({ error: "Öneriler hesaplanamadı" }, { status: 500 });
  }
}