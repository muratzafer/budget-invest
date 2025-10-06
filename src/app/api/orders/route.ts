import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json();
  // { holdingId, side: "buy"|"sell", quantity, price, currency, fee?, occurredAt }
  const { holdingId, side, quantity, price, currency, fee, occurredAt } = body;

  const order = await prisma.$transaction(async (tx: any) => {
    const h = await tx.holding.findUnique({
      where: { id: holdingId },
      select: { id: true, accountId: true, symbol: true, quantity: true, avgCost: true },
    });
    if (!h) throw new Error("Holding not found");

    const q = Number(quantity);
    const p = Number(price);
    const oldQty = Number(h.quantity ?? 0);
    const oldAvg = Number(h.avgCost ?? 0);

    let newQty = oldQty;
    let newAvg = oldAvg;

    if (side === "buy") {
      const totalCost = oldQty * oldAvg + q * p;
      newQty = oldQty + q;
      newAvg = newQty > 0 ? totalCost / newQty : 0;
    } else {
      // sell
      newQty = oldQty - q;
      if (newQty < 0) throw new Error("Sell qty exceeds position");
      if (newQty === 0) newAvg = 0;
    }

    const created = await tx.order.create({
      data: {
        holdingId,
        side,
        quantity: q,
        price: p,
        currency,
        fee: fee ?? null,
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      },
    });

    await tx.holding.update({
      where: { id: holdingId },
      data: {
        quantity: newQty,
        avgCost: newAvg,
      },
    });

    // Create matching Transaction for bookkeeping
    const gross = q * p;
    const feeNum = Number(fee ?? 0);
    const tType = side === "buy" ? "expense" : "income";
    const amount = side === "buy" ? gross + feeNum : gross - feeNum;

    await tx.transaction.create({
      data: {
        accountId: h.accountId,
        // You can fill categoryId via rules/ML later; keep null for now
        categoryId: null,
        type: tType,
        amount,
        currency,
        description: `${side === "buy" ? "Alım" : "Satım"} emri${h.symbol ? ` (${h.symbol})` : ""}`,
        merchant: "Order",
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      },
    });

    return created;
  });

  return NextResponse.json(order, { status: 201 });
}

export async function GET() {
  try {
    const orders = await prisma.order.findMany({
      include: {
        holding: {
          include: {
            account: true,
          },
        },
      },
      orderBy: {
        occurredAt: "desc",
      },
    });
    return NextResponse.json(orders, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch orders", details: error.message },
      { status: 500 }
    );
  }
}