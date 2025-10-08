import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/cron/snapshot
 * GET  -> hesaplanan snapshot (örnek önizleme)
 * POST -> veritabanına kaydet (PortfolioSnapshot tablosuna)
 *
 * Not: Şu anda sadece toplam portföy değeri (market/book/pnl) üzerinden çalışır.
 * Daha sonra kullanıcı bazlı veya kategori bazlı genişletilebilir.
 */

export async function GET() {
  try {
    // Mevcut portföy değerini örnekle hesapla (ileride holdings tablosundan alınacak)
    const holdings = await prisma.holding.findMany({
      select: { symbol: true, quantity: true, avgPrice: true, currency: true },
    });

    if (holdings.length === 0) {
      return NextResponse.json({ message: "No holdings found" });
    }

    // Fiyat verilerini /api/prices üzerinden çek
    const symbols = holdings.map((h) => h.symbol).join(",");
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/prices?mode=live&symbols=${symbols}`, { cache: "no-store" });
    const live = (await res.json()) ?? [];

    const totalBook = holdings.reduce((sum, h) => sum + Number(h.avgPrice) * Number(h.quantity), 0);
    const totalMarket = holdings.reduce((sum, h) => {
      const p = live.find((r: any) => r.symbol === h.symbol);
      return sum + (p ? Number(p.price) * Number(h.quantity) : 0);
    }, 0);
    const pnl = totalMarket - totalBook;
    const diffPct = totalBook > 0 ? (pnl / totalBook) * 100 : 0;

    const snapshot = {
      asOf: new Date(),
      totalBook,
      totalMarket,
      pnl,
      diffPct,
    };

    return NextResponse.json({ preview: snapshot });
  } catch (err) {
    console.error("GET /api/cron/snapshot error:", err);
    return NextResponse.json({ error: "Failed to compute snapshot" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Yukarıdaki hesaplamayı tekrar çalıştır
    const res = await GET();
    const data = await res.json();
    if (!data?.preview) return NextResponse.json({ error: "No snapshot data" }, { status: 400 });

    const s = data.preview;
    const created = await prisma.portfolioSnapshot.create({
      data: {
        asOf: new Date(s.asOf),
        totalMarket: s.totalMarket,
        totalBook: s.totalBook,
        pnl: s.pnl,
        diffPct: s.diffPct,
      },
    });

    return NextResponse.json({ success: true, snapshot: created });
  } catch (err) {
    console.error("POST /api/cron/snapshot error:", err);
    return NextResponse.json({ error: "Failed to save snapshot" }, { status: 500 });
  }
}

