import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: { symbol: string } },
) {
  const last = await prisma.price.findFirst({
    where: { symbol: params.symbol },
    orderBy: { asOf: "desc" },
  });
  return NextResponse.json(last ?? null);
}