import { formatDateISOFull } from "@/lib/format";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function parseAmount(val: unknown): number | null {
  const n = typeof val === "string" ? parseFloat(val) : typeof val === "number" ? val : NaN;
  return Number.isFinite(n) ? n : null;
}

function parseDate(val: unknown): Date | null {
  if (!val) return null;
  const d = new Date(val as any);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET() {
  try {
    const items = await prisma.recurringTemplate.findMany({
      orderBy: { createdAt: "desc" },
      include: { account: true, category: true },
    });
    const formatted = items.map((item) => ({
      ...item,
      amount: typeof (item as any).amount === "string" ? Number((item as any).amount) : (item as any).amount,
      createdAt: formatDateISOFull(item.createdAt),
      nextRunAt: item.nextRunAt ? formatDateISOFull(item.nextRunAt) : null,
      lastRunAt: item.lastRunAt ? formatDateISOFull(item.lastRunAt) : null,
    }));
    return NextResponse.json(formatted);
  } catch (err: any) {
    return bad(err?.message || "Failed to load recurrings", 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const type = body?.type as string | undefined; // "income" | "expense"
    const accountId = body?.accountId as string | undefined;
    const currency = body?.currency as string | undefined;
    const interval = body?.interval as string | undefined; // "monthly" | "weekly" | "daily" | "custom"

    if (!type || (type !== "income" && type !== "expense")) {
      return bad("'type' must be 'income' or 'expense'");
    }
    if (!accountId) return bad("'accountId' is required");
    if (!currency) return bad("'currency' is required");
    if (!interval) return bad("'interval' is required");

    const amount = parseAmount(body?.amount);
    if (amount == null) return bad("'amount' must be a number");

    const nextRunAtInput = parseDate(body?.nextRunAt) ?? new Date();

    // Optional fields
    const categoryId = (body?.categoryId ?? null) as string | null;
    const description = (body?.description ?? null) as string | null;
    const merchant = (body?.merchant ?? null) as string | null;
    const dayOfMonth = body?.dayOfMonth ?? null;
    const weekday = body?.weekday ?? null;
    const everyNDays = body?.everyNDays ?? null;
    const isActive = (body?.isActive ?? true) as boolean;

    const created = await prisma.recurringTemplate.create({
      data: {
        type,
        accountId,
        categoryId,
        amount,
        currency,
        description,
        merchant,
        interval,
        dayOfMonth,
        weekday,
        everyNDays,
        nextRunAt: nextRunAtInput,
        isActive,
      },
    });

    return NextResponse.json(
      {
        ...created,
        createdAt: formatDateISOFull(created.createdAt),
        nextRunAt: created.nextRunAt ? formatDateISOFull(created.nextRunAt) : null,
        lastRunAt: created.lastRunAt ? formatDateISOFull(created.lastRunAt) : null,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return bad(err?.message || "Failed to create recurring", 500);
  }
}