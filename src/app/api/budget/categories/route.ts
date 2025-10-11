

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/budget/categories
// Returns list of all categories (id, name, type)
export async function GET() {
  try {
    const cats = await prisma.category.findMany({
      select: {
        id: true,
        name: true,
        type: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ ok: true, items: cats });
  } catch (err) {
    console.error("GET /api/budget/categories error:", err);
    return NextResponse.json({ ok: false, error: "Kategori listesi alınamadı." }, { status: 500 });
  }
}

// (Optional future extension)
// export async function POST(req: Request) {
//   const body = await req.json();
//   // name, type gibi alanlarla yeni kategori ekleme yapılabilir.
// }