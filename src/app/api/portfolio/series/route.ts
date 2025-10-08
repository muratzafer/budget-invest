import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SeriesPoint = {
  asOf: string;
  totalMarket: number;
  totalBook: number;
  pnl: number;
  diffPct: number;
};

/**
 * GET /api/portfolio/series
 * Query params:
 *  - days: number (default 30, max 365) -> last N days (or hours if your snapshot is hourly)
 *  - from, to: ISO strings (optional) -> overrides "days" if provided
 *
 * Returns ascending time-ordered series of portfolio snapshots.
 * NOTE: Requires Prisma model PortfolioSnapshot (see bottom of file for schema).
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const daysParam = Number(url.searchParams.get("days") ?? 30);
    const days = Number.isFinite(daysParam) ? Math.max(1, Math.min(365, daysParam)) : 30;

    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

    let from: Date | undefined;
    let to: Date | undefined;

    if (fromParam) {
      const d = new Date(fromParam);
      if (!isNaN(d.getTime())) from = d;
    }
    if (toParam) {
      const d = new Date(toParam);
      if (!isNaN(d.getTime())) to = d;
    }
    if (!from) {
      const d = new Date();
      d.setDate(d.getDate() - days);
      from = d;
    }
    if (!to) to = new Date();

    const rows = (await prisma.portfolioSnapshot.findMany({
      where: {
        asOf: {
          gte: from,
          lte: to,
        },
      },
      orderBy: { asOf: "asc" },
      select: {
        asOf: true,
        totalMarket: true,
        totalBook: true,
        pnl: true,
        diffPct: true,
      },
    })) as any[];

    const series: SeriesPoint[] = rows.map((r: any) => ({
      asOf: r.asOf.toISOString(),
      totalMarket: Number(r.totalMarket),
      totalBook: Number(r.totalBook),
      pnl: Number(r.pnl),
      diffPct: Number(r.diffPct ?? (Number(r.totalBook) > 0 ? (Number(r.pnl) / Number(r.totalBook)) * 100 : 0)),
    }));

    return NextResponse.json({
      from: from.toISOString(),
      to: to.toISOString(),
      count: series.length,
      series,
    });
  } catch (err: any) {
    console.error("GET /api/portfolio/series error:", err);
    const msg =
      typeof err?.message === "string" && err.message.includes("portfolioSnapshot")
        ? "Prisma model 'PortfolioSnapshot' tanımlı değil veya migrate edilmedi. Lütfen schema.prisma içine modeli ekleyip `npx prisma migrate dev` çalıştırın."
        : "Failed to load portfolio series";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/*
-- Prisma model (schema.prisma) — ekleyip migrate edin:
model PortfolioSnapshot {
  id          String   @id @default(cuid())
  asOf        DateTime @default(now())
  totalMarket Decimal
  totalBook   Decimal
  pnl         Decimal
  diffPct     Float?
  createdAt   DateTime @default(now())
}
*/