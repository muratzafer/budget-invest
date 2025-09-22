import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CategoryCreateSchema } from "@/lib/validators";

type Params = { params: { id: string } };

export async function PUT(req: Request, { params }: Params) {
  const body = await req.json();
  const parsed = CategoryCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const updated = await prisma.category.update({
    where: { id: params.id },
    data: parsed.data,
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
  await prisma.category.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}