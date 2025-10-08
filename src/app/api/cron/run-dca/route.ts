

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/cron/run-dca
 * GET  -> dry-run (hangi planların çalışacağını hesaplar, DB yazmaz)
 * POST -> gerçek çalıştırma (lastRunAt/nextRunAt günceller)
 *
 * Not: Burada gerçek emir oluşturma yok; sadece planları "koşuldu" sayarak tarihleri ilerletiyoruz.
 */

type Period = "daily" | "weekly" | "monthly";

function addPeriod(from: Date, period: Period): Date {
  const d = new Date(from);
  if (period === "daily") d.setDate(d.getDate() + 1);
  else if (period === "weekly") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

async function computeRunnable(now: Date) {
  // Aktif olan ve nextRunAt geçilmiş (veya boş) planlar
  const plans = await prisma.dCAPlan.findMany({
    where: {
      status: "active",
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
    },
    orderBy: [{ nextRunAt: "asc" }, { name: "asc" }],
  });

  // Çalıştırma önizlemesi
  const preview = plans.map((p: { nextRunAt: Date | null; period: string; id: any; name: any; symbol: any; amount: any; lastRunAt: Date | null; }) => {
    const anchor = p.nextRunAt && new Date(p.nextRunAt) < now ? new Date(p.nextRunAt) : now;
    const next = addPeriod(anchor ?? now, (p.period as Period) || "monthly");
    return {
      id: p.id,
      name: p.name,
      symbol: p.symbol,
      amount: Number(p.amount),
      period: p.period,
      lastRunAt: p.lastRunAt,
      nextRunAt: p.nextRunAt,
      willRunAt: now.toISOString(),
      willSetNext: next.toISOString(),
    };
  });

  return { plans, preview };
}

export async function GET(req: NextRequest) {
  try {
    const now = new Date();
    const { preview } = await computeRunnable(now);
    return NextResponse.json({ now: now.toISOString(), count: preview.length, preview });
  } catch (err) {
    console.error("GET /api/cron/run-dca error:", err);
    return NextResponse.json({ error: "Failed to compute DCA run" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const now = new Date();
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;

    const { plans, preview } = await computeRunnable(now);

    if (dryRun || plans.length === 0) {
      return NextResponse.json({ now: now.toISOString(), ran: 0, preview });
    }

    // lastRunAt = now, nextRunAt = addPeriod(anchor, period)
    const updates = plans.map((p: { nextRunAt: Date | null; period: string; id: any; }) => {
      const anchor = p.nextRunAt && new Date(p.nextRunAt) < now ? new Date(p.nextRunAt) : now;
      const next = addPeriod(anchor ?? now, (p.period as Period) || "monthly");
      return prisma.dCAPlan.update({
        where: { id: p.id },
        data: { lastRunAt: now, nextRunAt: next },
      });
    });

    const results = await prisma.$transaction(updates);

    return NextResponse.json({
      now: now.toISOString(),
      ran: results.length,
      updated: results.map((r) => ({
        id: r.id,
        name: r.name,
        symbol: r.symbol,
        amount: Number(r.amount),
        period: r.period,
        lastRunAt: r.lastRunAt,
        nextRunAt: r.nextRunAt,
      })),
    });
  } catch (err: any) {
    console.error("POST /api/cron/run-dca error:", err);
    const msg =
      typeof err?.message === "string" && err.message.includes("dCAPlan")
        ? "Prisma model 'DCAPlan' migrate edilmemiş olabilir. Lütfen schema.prisma içinde modeli ekleyip migrate edin."
        : "Failed to run DCA cron";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}