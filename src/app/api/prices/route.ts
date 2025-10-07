

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { Prisma } from "@prisma/client";

const PriceCreateSchema = z.object({
  symbol: z.string().min(1),
  price: z.number().positive(),
  asOf: z.string().datetime().optional(), // ISO datetime string
});

// POST /api/prices  -> yeni fiyat ekler
export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const { symbol, price, asOf } = PriceCreateSchema.parse(raw);

    const created = await prisma.price.create({
      data: {
        symbol,
        price: new Prisma.Decimal(price),
        asOf: asOf ? new Date(asOf) : new Date(),
        currency: "USD", // Replace with appropriate default or dynamic value
        source: "manual", // Replace with appropriate default or dynamic value
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    const message = err?.message ?? "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// GET /api/prices?symbol=BTCUSDT&limit=10
// GET /api/prices  -> son fiyatları listeler
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol") ?? undefined;
    const limit = Math.min(Number(searchParams.get("limit") ?? 20), 500);

    const where = symbol ? { symbol } : {};
    const items = await prisma.price.findMany({
      where,
      orderBy: { asOf: "desc" },
      take: limit,
    });

    return NextResponse.json(items);
  } catch (err: any) {
    console.error("GET /api/prices error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to fetch prices" },
      { status: 500 }
    );
  }
}