import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function POST(req: Request) {
  const body = await req.json();
  // { holdingId, side: "buy"|"sell", quantity, price, currency, fee?, occurredAt }
  const { holdingId, side, quantity, price, currency, fee, occurredAt } = body;

  const order = await prisma.$transaction(async (tx) => {
    const h = await tx.holding.findUnique({ where: { id: holdingId } });
    if (!h) throw new Error("Holding not found");

    const q = new Prisma.Decimal(quantity);
    const p = new Prisma.Decimal(price);
    const oldQty = new Prisma.Decimal(h.quantity ?? 0);
    const oldAvg = new Prisma.Decimal(h.avgCost ?? 0);

    let newQty = oldQty;
    let newAvg = oldAvg;

    if (side === "buy") {
      const totalCost = oldQty.mul(oldAvg).add(q.mul(p));
      newQty = oldQty.add(q);
      newAvg = newQty.gt(0) ? totalCost.div(newQty) : new Prisma.Decimal(0);
    } else {
      // sell
      newQty = oldQty.sub(q);
      if (newQty.lt(0)) throw new Error("Sell qty exceeds position");
      // avgCost same; if position closes reset avg to 0
      if (newQty.eq(0)) newAvg = new Prisma.Decimal(0);
    }

    const created = await tx.order.create({
      data: {
        holdingId,
        side,
        quantity: q,
        price: p,
        currency,
        fee,
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