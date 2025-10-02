import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json();
  // { holdingId, side: "buy"|"sell", quantity, price, currency, fee?, occurredAt }
  const { holdingId, side, quantity, price, currency, fee, occurredAt } = body;

  const order = await prisma.$transaction(async (tx: any) => {
    const h = await tx.holding.findUnique({ where: { id: holdingId } });
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