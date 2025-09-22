import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CategoryCreateSchema } from "@/lib/validators";

export async function GET() {
  const items = await prisma.category.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = CategoryCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const created = await prisma.category.create({ data: parsed.data });
  return NextResponse.json(created, { status: 201 });
}