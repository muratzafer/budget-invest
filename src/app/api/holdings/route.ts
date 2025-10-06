import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

// ── Schemas ───────────────────────────────────────────────────────────────────
const HoldingCreateSchema = z.object({
  symbol: z.string().trim().min(1),
  // We keep assetType flexible for now; your schema may restrict it later
  assetType: z.string().trim().min(1).optional().default("crypto"),
  currency: z.string().trim().min(1),
  accountId: z.string().trim().min(1).optional().nullable(),
  quantity: z.coerce.number(),
  avgCost: z.coerce.number(),
});

export async function GET() {
  const rows = await prisma.holding.findMany({
    include: {
      account: {
        select: { id: true, name: true, type: true },
      },
    },
    orderBy: [{ symbol: "asc" }],
  });

  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const parsed = HoldingCreateSchema.parse(payload);

    // Prisma expects undefined rather than null for optional relations
    const data = {
      ...parsed,
      accountId: parsed.accountId ?? undefined,
    };

    const created = await prisma.holding.create({ data });
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    // Zod errors or any runtime errors
    const message =
      err?.issues?.map?.((i: any) => i.message).join(", ") ??
      err?.message ??
      "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}