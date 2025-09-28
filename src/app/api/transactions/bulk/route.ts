import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { classifyCategoryId } from "@/lib/classifier";

type RawTx = {
  accountId: string;
  categoryId?: string | null;
  type: "income" | "expense" | "transfer";
  amount: number;
  currency: string;
  description?: string | null;
  merchant?: string | null;
  occurredAt: string; // ISO veya YYYY-MM-DD
};

export async function POST(req: Request) {
  const body = (await req.json()) as { items: RawTx[] };
  if (!Array.isArray(body?.items) || body.items.length === 0) {
    return NextResponse.json({ error: "items boş" }, { status: 400 });
  }

  // basit doğrulama + normalizasyon
  const data = await Promise.all(
    body.items.map(async (t) => {
      let resolvedCategoryId: string | null = t.categoryId ?? null;
      if (!resolvedCategoryId) {
        const classification = await classifyCategoryId({
          description: t.description ?? null,
          merchant: t.merchant ?? null,
        });
        resolvedCategoryId = classification.categoryId;
      }

      return {
        accountId: t.accountId,
        categoryId: resolvedCategoryId,
        type: t.type,
        amount: Number(t.amount),
        currency: t.currency,
        description: t.description ?? null,
        merchant: t.merchant ?? null,
        occurredAt: new Date(t.occurredAt),
      };
    })
  );

  await prisma.transaction.createMany({ data });
  return NextResponse.json({ ok: true, count: data.length }, { status: 201 });
}