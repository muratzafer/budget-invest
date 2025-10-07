import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

/**
 * Collection endpoint for Holdings
 * - GET  /api/holdings      -> list all holdings (with account info)
 * - POST /api/holdings      -> create a holding
 */

// ── Validation ────────────────────────────────────────────────────────────────
const HoldingCreateSchema = z.object({
  symbol: z.string().trim().min(1, "symbol is required"),
  // Keep flexible. You may later restrict to: ["stock","fund","etf","crypto","gold"]
  assetType: z.string().trim().min(1).optional().default("crypto"),
  currency: z.string().trim().min(1, "currency is required"),
  accountId: z.string().trim().min(1).optional().nullable(),
  quantity: z.coerce.number().nonnegative("quantity must be >= 0"),
  avgCost: z.coerce.number().nonnegative("avgCost must be >= 0"),
});

// ── GET: list holdings ───────────────────────────────────────────────────────
export async function GET() {
  try {
    const rows = await prisma.holding.findMany({
      include: {
        account: {
          select: { id: true, name: true, type: true, currency: true },
        },
      },
      orderBy: [{ symbol: "asc" }],
    });

    return NextResponse.json(rows, { status: 200 });
  } catch (err: any) {
    const message = err?.message ?? "Failed to load holdings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST: create holding ─────────────────────────────────────────────────────
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
    // Handle Zod validation and generic runtime errors
    const message =
      err?.issues?.map?.((i: any) => i.message).join(", ") ??
      err?.message ??
      "Unknown error";
    const status = err?.name === "ZodError" ? 400 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}