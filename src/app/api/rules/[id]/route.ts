import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  await prisma.rule.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}