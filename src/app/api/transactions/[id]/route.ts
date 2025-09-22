import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Params = { params: { id: string } };

export async function DELETE(_req: Request, { params }: Params) {
  await prisma.transaction.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}