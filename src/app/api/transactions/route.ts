import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { TransactionCreateSchema } from "@/lib/validators";

// GET /api/transactions?limit=50&type=expense|income|transfer
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? "50");
  const type = searchParams.get("type") as "income" | "expense" | "transfer" | null;

  const where = type ? { type } : {};

  const items = await prisma.transaction.findMany({
    where,
    include: { account: true, category: true },
    orderBy: { occurredAt: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
  });

  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = TransactionCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const created = await prisma.transaction.create({
    data: {
      accountId: data.accountId,
      categoryId: data.categoryId ?? null,
      type: data.type,
      amount: data.amount, // Prisma `Decimal` için sayı verirsek otomatik dönüştürür
      currency: data.currency,
      description: data.description ?? null,
      merchant: data.merchant ?? null,
      occurredAt: data.occurredAt,
    },
    include: { account: true, category: true },
  });

  return NextResponse.json(created, { status: 201 });
}