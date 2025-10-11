

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Rules CRUD
 * Endpoint: /api/budget/rules
 * Methods:
 *  - GET    → listele (opsiyonel filtreler/paging)
 *  - POST   → oluştur
 *  - PUT    → güncelle (id zorunlu)
 *  - DELETE → sil (id zorunlu)
 */

function toBool(x: any, def = false) {
  if (typeof x === "boolean") return x;
  if (x === "true" || x === 1 || x === "1") return true;
  if (x === "false" || x === 0 || x === "0") return false;
  return def;
}
function toInt(x: any, def = 0) {
  const n = Number(x);
  return Number.isInteger(n) ? n : def;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url, process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000");
    const q = url.searchParams.get("q")?.trim() || "";
    const categoryId = url.searchParams.get("categoryId") || undefined;
    const limit = Math.min(100, Math.max(1, toInt(url.searchParams.get("limit"), 50)));
    const offset = Math.max(0, toInt(url.searchParams.get("offset"), 0));

    const where: any = {};
    if (categoryId) where.categoryId = categoryId;
    if (q) where.pattern = { contains: q, mode: "insensitive" };

    const [items, total] = await Promise.all([
      prisma.rule.findMany({
        where,
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        skip: offset,
        take: limit,
        select: { id: true, pattern: true, isRegex: true, merchantOnly: true, priority: true, categoryId: true, createdAt: true },
      }),
      prisma.rule.count({ where }),
    ]);

    return NextResponse.json({ ok: true, total, items, limit, offset });
  } catch (e: any) {
    console.error("[rules.GET]", e);
    return NextResponse.json({ ok: false, error: e?.message || "failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const pattern = String(body?.pattern || "").trim();
    const categoryId = String(body?.categoryId || "").trim();
    if (!pattern) return NextResponse.json({ ok: false, error: "pattern required" }, { status: 400 });
    if (!categoryId) return NextResponse.json({ ok: false, error: "categoryId required" }, { status: 400 });

    const isRegex = toBool(body?.isRegex, false);
    const merchantOnly = toBool(body?.merchantOnly, true);
    const priority = toInt(body?.priority, 100);

    const created = await prisma.rule.create({
      data: { pattern, isRegex, merchantOnly, priority, categoryId },
      select: { id: true, pattern: true, isRegex: true, merchantOnly: true, priority: true, categoryId: true, createdAt: true },
    });
    return NextResponse.json({ ok: true, item: created });
  } catch (e: any) {
    console.error("[rules.POST]", e);
    return NextResponse.json({ ok: false, error: e?.message || "failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body?.id || "").trim();
    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

    const data: any = {};
    if (typeof body?.pattern === "string") data.pattern = String(body.pattern).trim();
    if (body?.categoryId !== undefined) data.categoryId = String(body.categoryId).trim();
    if (body?.isRegex !== undefined) data.isRegex = toBool(body.isRegex);
    if (body?.merchantOnly !== undefined) data.merchantOnly = toBool(body.merchantOnly);
    if (body?.priority !== undefined) data.priority = toInt(body.priority, 100);

    if (!Object.keys(data).length) return NextResponse.json({ ok: false, error: "no fields" }, { status: 400 });

    const updated = await prisma.rule.update({
      where: { id },
      data,
      select: { id: true, pattern: true, isRegex: true, merchantOnly: true, priority: true, categoryId: true, createdAt: true },
    });
    return NextResponse.json({ ok: true, item: updated });
  } catch (e: any) {
    console.error("[rules.PUT]", e);
    return NextResponse.json({ ok: false, error: e?.message || "failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url, process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000");
    const idQP = url.searchParams.get("id");
    let id = idQP ? String(idQP) : "";

    if (!id) {
      // Body'den de almayı dene
      const body = await req.json().catch(() => ({}));
      if (body?.id) id = String(body.id);
    }

    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

    const deleted = await prisma.rule.delete({
      where: { id },
      select: { id: true, pattern: true },
    });
    return NextResponse.json({ ok: true, item: deleted });
  } catch (e: any) {
    console.error("[rules.DELETE]", e);
    return NextResponse.json({ ok: false, error: e?.message || "failed" }, { status: 500 });
  }
}