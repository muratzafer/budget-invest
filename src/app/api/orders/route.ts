import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

/**
 * Validate incoming order payload
 */
const OrderSchema = z.object({
  holdingId: z.string().min(1, "holdingId is required"),
  side: z.enum(["buy", "sell"]),
  quantity: z.coerce.number().positive("quantity must be > 0"),
  price: z.coerce.number().positive("price must be > 0"),
  currency: z.string().min(1).max(10),
  fee: z.coerce.number().nonnegative().optional().nullable(),
  occurredAt: z.union([z.string(), z.date()]).optional(),
});

function toDate(value?: string | Date) {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) return new Date();
  return d;
}

/**
 * POST /api/orders
 * Creates an order and updates the linked holding atomically.
 * Also mirrors the cash movement into the Transactions table.
 */
export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = OrderSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { holdingId, side, quantity, price, currency, fee, occurredAt } = parsed.data;

    const created = await prisma.$transaction(async (tx) => {
      const h = await tx.holding.findUnique({
        where: { id: holdingId },
        select: { id: true, accountId: true, symbol: true, quantity: true, avgCost: true },
      });
      if (!h) throw new Error("Holding not found");

      const oldQty = Number(h.quantity ?? 0);
      const oldAvg = Number(h.avgCost ?? 0);
      const q = Number(quantity);
      const p = Number(price);

      let newQty = oldQty;
      let newAvg = oldAvg;

      if (side === "buy") {
        const totalCost = oldQty * oldAvg + q * p;
        newQty = oldQty + q;
        newAvg = newQty > 0 ? totalCost / newQty : 0;
      } else {
        // sell
        if (q > oldQty) throw new Error("Sell qty exceeds position");
        newQty = oldQty - q;
        newAvg = newQty === 0 ? 0 : oldAvg;
      }

      // 1) Create order
      const order = await tx.order.create({
        data: {
          holdingId,
          side,
          quantity: q,
          price: p,
          currency,
          fee: fee ?? null,
          occurredAt: toDate(occurredAt),
        },
      });

      // 2) Update holding (qty / avgCost)
      await tx.holding.update({
        where: { id: holdingId },
        data: {
          quantity: newQty,
          avgCost: newAvg,
          // touchedAt? updated automatically by updatedAt if you have it
        },
      });

      // 3) Mirror cash movement to Transaction table (bookkeeping)
      const gross = q * p;
      const feeNum = Number(fee ?? 0);
      const tType = side === "buy" ? "expense" : "income";
      const amount = side === "buy" ? gross + feeNum : Math.max(gross - feeNum, 0);

      const description = `${side === "buy" ? "Alım" : "Satım"} emri${h.symbol ? ` (${h.symbol})` : ""}`;

      await tx.transaction.create({
        data: {
          accountId: h.accountId!, // holding must belong to an account
          categoryId: null, // filled by rules/ML later
          type: tType,
          amount,
          currency,
          description,
          merchant: "Order",
          occurredAt: toDate(occurredAt),
          // categorySource/suggestions left null intentionally
        },
      });

      return order;
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to create order", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/orders
 * Returns orders with holding + account context.
 * Supports optional filtering by holdingId via query string.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const holdingId = url.searchParams.get("holdingId") || undefined;

    const orders = await prisma.order.findMany({
      where: holdingId ? { holdingId } : undefined,
      include: {
        holding: {
          include: { account: true },
        },
      },
      orderBy: { occurredAt: "desc" },
    });

    return NextResponse.json(orders, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to fetch orders",
        details: error?.message ?? String(error),
      },
      { status: 500 }
    );
  }
}