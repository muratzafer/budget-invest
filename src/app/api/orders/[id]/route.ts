import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/orders/[id]
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(order);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "GET failed" }, { status: 500 });
  }
}

// PATCH /api/orders/[id]
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const payload = (await req.json()) as Record<string, any>;
    // Remove immutable keys and undefineds
    const { id: _omitId, createdAt: _omitCreated, updatedAt: _omitUpdated, ...data } = payload ?? {};
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

    // Ensure record exists (gives nicer 404)
    const exists = await prisma.order.findUnique({ where: { id } });
    if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.order.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "PATCH failed" }, { status: 400 });
  }
}

// DELETE /api/orders/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    await prisma.order.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    // If already deleted / not found
    if (err?.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: err?.message ?? "DELETE failed" }, { status: 500 });
  }
}