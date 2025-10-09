

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * DCAPlan CRUD
 * Model (prisma):
 *  id        String   @id @default(cuid())
 *  name      String
 *  symbol    String
 *  amount    Float
 *  period    String   // daily | weekly | monthly | custom-<cron>
 *  status    String   // active | paused
 *  lastRunAt DateTime?
 *  nextRunAt DateTime?
 *  createdAt DateTime @default(now())
 */

type DCAIncoming = Partial<{
  id: string;
  name: string;
  symbol: string;
  amount: number;
  period: string;
  status: string;
  lastRunAt: string | Date | null;
  nextRunAt: string | Date | null;
}>;

function toDateOrNull(v: any): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.valueOf()) ? d : null;
}

function sanitizePayload(body: DCAIncoming) {
  const name = String(body?.name ?? "").trim();
  const symbol = String(body?.symbol ?? "").trim().toUpperCase();
  const amount = Number(body?.amount);
  const period = String(body?.period ?? "").trim();
  const status = String(body?.status ?? "active").trim();

  const lastRunAt = toDateOrNull(body?.lastRunAt);
  const nextRunAt = toDateOrNull(body?.nextRunAt);

  return { name, symbol, amount, period, status, lastRunAt, nextRunAt };
}

function validateCreate(p: ReturnType<typeof sanitizePayload>) {
  if (!p.name) throw new Error("name is required");
  if (!p.symbol) throw new Error("symbol is required");
  if (!Number.isFinite(p.amount) || p.amount <= 0) throw new Error("amount must be > 0");
  if (!p.period) throw new Error("period is required");
  if (!["active", "paused"].includes(p.status)) throw new Error("status must be 'active' or 'paused'");
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  try {
    if (id) {
      const plan = await prisma.dCAPlan.findUnique({ where: { id } });
      if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json(plan);
    }
    const plans = await prisma.dCAPlan.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(plans);
  } catch (err) {
    console.error("GET /api/dca error:", err);
    return NextResponse.json({ error: "Failed to fetch DCA plans" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DCAIncoming;
    const p = sanitizePayload(body);
    validateCreate(p);

    const created = await prisma.dCAPlan.create({
      data: {
        name: p.name,
        symbol: p.symbol,
        amount: p.amount,
        period: p.period,
        status: p.status as "active" | "paused",
        lastRunAt: p.lastRunAt ?? undefined,
        nextRunAt: p.nextRunAt ?? undefined,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/dca error:", err);
    return NextResponse.json({ error: err?.message || "Failed to create DCA plan" }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as DCAIncoming;
    const id = String(body?.id ?? "");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const p = sanitizePayload(body);
    // allow partial updates: only include provided fields
    const data: any = {};
    if (p.name) data.name = p.name;
    if (p.symbol) data.symbol = p.symbol;
    if (Number.isFinite(p.amount as number)) data.amount = p.amount;
    if (p.period) data.period = p.period;
    if (p.status) data.status = p.status;
    if (p.lastRunAt !== null) data.lastRunAt = p.lastRunAt ?? undefined;
    if (p.nextRunAt !== null) data.nextRunAt = p.nextRunAt ?? undefined;

    const updated = await prisma.dCAPlan.update({
      where: { id },
      data,
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    // Prisma not found
    if (err?.code === "P2025") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    console.error("PUT /api/dca error:", err);
    return NextResponse.json({ error: err?.message || "Failed to update DCA plan" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

    await prisma.dCAPlan.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err?.code === "P2025") {
      return NextResponse.json({ success: true, note: "already deleted" });
    }
    console.error("DELETE /api/dca error:", err);
    return NextResponse.json({ error: "Failed to delete DCA plan" }, { status: 500 });
  }
}