import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
// no-op

// Allowed/validated fields for a partial update
const HoldingPatchSchema = z
  .object({
    symbol: z.string().trim().min(1).transform((s) => s.toUpperCase()).optional(),
    quantity: z.coerce.number().finite().nonnegative().optional(),
    avgCost: z.coerce.number().finite().nonnegative().optional(),
    currency: z
      .string()
      .trim()
      .min(3)
      .max(3)
      .transform((s) => s.toUpperCase())
      .optional(),
    accountId: z.string().trim().min(1).optional(),
    notes: z.string().nullable().optional(),
  })
  .strict();

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const holding = await prisma.holding.findUnique({
      where: { id: params.id },
      include: { account: { select: { id: true, name: true } } },
    });
    if (!holding) {
      return NextResponse.json({ error: "Holding not found" }, { status: 404 });
    }
    return NextResponse.json(holding);
  } catch (err) {
    console.error("GET /api/holdings/[id] error", err);
    return NextResponse.json(
      { error: "Failed to fetch holding" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const json = await req.json();
    const parsed = HoldingPatchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const data = { ...parsed.data } as any;

    // Treat empty-string notes as null
    if ("notes" in data && data.notes === "") {
      data.notes = null;
    }

    // Require at least one field to update
    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No fields provided" },
        { status: 400 },
      );
    }

    // If accountId is provided, ensure it exists
    if (data.accountId) {
      const acc = await prisma.account.findUnique({ where: { id: data.accountId } });
      if (!acc) {
        return NextResponse.json({ error: "Account not found" }, { status: 400 });
      }
    }

    const updated = await prisma.holding.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json(updated);
  } catch (err: any) {
    if (err?.code === "P2025") {
      // Prisma record not found
      return NextResponse.json({ error: "Holding not found" }, { status: 404 });
    }
    console.error("PATCH /api/holdings/[id] error", err);
    return NextResponse.json(
      { error: "Failed to update holding" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    await prisma.holding.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === "P2025") {
      // Prisma record not found
      return NextResponse.json({ error: "Holding not found" }, { status: 404 });
    }
    console.error("DELETE /api/holdings/[id] error", err);
    return NextResponse.json(
      { error: "Failed to delete holding" },
      { status: 500 },
    );
  }
}