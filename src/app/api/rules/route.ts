import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { RuleCreateSchema } from "@/lib/validators";

export async function GET() {
  const rules = await prisma.rule.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    include: { category: true },
  });
  return NextResponse.json(rules);
}

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = RuleCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const created = await prisma.rule.create({ data: parsed.data });
  return NextResponse.json(created, { status: 201 });
}