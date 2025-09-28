import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type RouteParams = { params: { id: string } };

// PATCH /api/transactions/[id]
// body: { action: "confirm" } | { action: "recategorize", categoryId: string }
export async function PATCH(req: Request, { params }: RouteParams) {
  const body = await req.json().catch(() => ({} as any));
  const action = body?.action as "confirm" | "recategorize";

  if (action === "confirm") {
    // ML ile geleni kullanıcı onayladı → source=user
    const updated = await prisma.transaction.update({
      where: { id: params.id },
      data: { categorySource: "user" },
      include: { account: true, category: true },
    });
    return NextResponse.json(updated);
  }

  if (action === "recategorize") {
    const categoryId = body?.categoryId as string | undefined;
    if (!categoryId) {
      return NextResponse.json({ error: "categoryId required" }, { status: 400 });
    }
    const updated = await prisma.transaction.update({
      where: { id: params.id },
      data: {
        categoryId,
        categorySource: "user",
        suggestedCategoryId: null,
        suggestedConfidence: null,
      },
      include: { account: true, category: true },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

// DELETE /api/transactions/[id]
export async function DELETE(_req: Request, { params }: RouteParams) {
  await prisma.transaction.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
