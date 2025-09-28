import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const rows = await prisma.holding.findMany({
    include: { account: true },
    orderBy: [{ symbol: "asc" }],
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  // { symbol, assetType, currency, accountId?, quantity, avgCost }
  const created = await prisma.holding.create({ data: body });
  return NextResponse.json(created, { status: 201 });
}