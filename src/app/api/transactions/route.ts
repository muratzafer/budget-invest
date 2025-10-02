import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { TransactionCreateSchema } from "@/lib/validators";
import { classifyCategoryId } from "@/lib/classifier";
import { formatDateISO } from "@/lib/format";

// Ensure deterministic date strings in API responses
function serializeTx<T extends { occurredAt: Date }>(t: T) {
  return { ...t, occurredAt: formatDateISO(t.occurredAt) };
}

// Enhanced GET /api/transactions with filtering and pagination
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "50"), 1), 200);

  const typeParam = searchParams.get("type");
  const type =
    typeParam === "income" || typeParam === "expense" || typeParam === "transfer"
      ? typeParam
      : undefined;

  const accountId = searchParams.get("accountId") || undefined;
  const categoryId = searchParams.get("categoryId") || undefined;

  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  const from = fromStr ? new Date(fromStr) : undefined;
  const to = toStr ? new Date(toStr) : undefined;

  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const contains = q ? { contains: q, mode: "insensitive" as const } : undefined;

  const cursor = searchParams.get("cursor") || undefined;

  const where: any = {};
  if (type) where.type = type;
  if (accountId) where.accountId = accountId;
  if (categoryId) where.categoryId = categoryId;
  if (from || to) {
    where.occurredAt = {};
    if (from) where.occurredAt.gte = from;
    if (to) where.occurredAt.lte = to;
  }
  if (q) {
    where.OR = [
      { merchant: contains },
      { description: contains },
    ];
  }

  const items = await prisma.transaction.findMany({
    where,
    include: { account: true, category: true },
    orderBy: { occurredAt: "desc" },
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  let nextCursor: string | null = null;
  if (items.length > limit) {
    const next = items.pop()!;
    nextCursor = next.id;
  }

  return NextResponse.json({
    items: items.map(serializeTx),
    nextCursor,
  });
}

export async function POST(req: Request) {
  try {
    const raw = await req.json();

    // Preprocess: normalize empty category and coerce fields
    if (raw && typeof raw === "object") {
      if (raw.categoryId === "" || raw.categoryId === "(yok)") raw.categoryId = null;
      if (raw.amount != null) raw.amount = Number(raw.amount);
      if (raw.date && !raw.occurredAt) raw.occurredAt = raw.date;
      if (raw.occurredAt) raw.occurredAt = new Date(raw.occurredAt);
    }

    // Validate with your schema (kept as-is)
    const parsed = TransactionCreateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;

    // Category resolution
    let categoryId: string | null =
      data.categoryId && data.categoryId !== "(yok)" ? data.categoryId : null;
    let categorySource: "user" | "rule" | "ml" | undefined = undefined;
    let suggestedCategoryId: string | null = null;
    let suggestedConfidence: number | null = null;

    if (categoryId) {
      categorySource = "user";
    } else {
      const cls = await classifyCategoryId({
        description: data.description ?? null,
        merchant: data.merchant ?? null,
      }); // { categoryId, source?: 'rule'|'ml', confidence?: number }

      if (cls?.categoryId) {
        if (cls.source === "rule") {
          categoryId = cls.categoryId;
          categorySource = "rule";
        } else if (cls.source === "ml") {
          const threshold = Number(process.env.NEXT_PUBLIC_ML_CONF_THRESHOLD ?? "0.35");
          if (cls.confidence != null && cls.confidence < threshold) {
            // düşük güven → öneri olarak kaydet
            suggestedCategoryId = cls.categoryId;
            suggestedConfidence = cls.confidence ?? null;
            // categoryId null kalır
          } else {
            categoryId = cls.categoryId;
            categorySource = "ml";
          }
        }
      }
    }

    const created = await prisma.transaction.create({
      data: {
        accountId: data.accountId,
        categoryId,
        type: data.type,
        amount: Number(data.amount),
        currency: data.currency,
        description: data.description ?? null,
        merchant: data.merchant ?? null,
        occurredAt: data.occurredAt ?? new Date(),
        ...(categorySource ? { categorySource } : {}),
        suggestedCategoryId,
        suggestedConfidence,
      },
      include: { account: true, category: true },
    });

    return NextResponse.json(serializeTx(created), { status: 201 });
  } catch (err: any) {
    console.error("POST /api/transactions error:", err);
    return NextResponse.json(
      { error: err?.message ?? "create_failed" },
      { status: 400 }
    );
  }
}
