import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bu endpoint portföy hedef dağılımlarını yönetir.
// GET -> tüm hedefleri getirir
// POST -> hedefleri günceller (tam listeyi replace eder)

export async function GET() {
  try {
    const targets = await prisma.targetAllocation.findMany({
      orderBy: { symbol: "asc" },
    });
    return NextResponse.json(targets);
  } catch (err) {
    console.error("GET /api/targets error:", err);
    return NextResponse.json({ error: "Failed to load targets" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: "Expected an array of { symbol, targetPct }" }, { status: 400 });
    }

    // Basit doğrulama + normalize
    const cleaned = body
      .filter((r) => r && typeof r.symbol === "string")
      .map((r) => ({
        symbol: String(r.symbol).toUpperCase().trim(),
        targetPct: Number(r.targetPct),
      }))
      .filter((r) => r.symbol.length > 0 && Number.isFinite(r.targetPct));

    if (cleaned.length === 0) {
      return NextResponse.json({ error: "No valid rows provided" }, { status: 400 });
    }

    // Toplam % kontrolü (uyumsuzsa oransal normalize edelim)
    const sum = cleaned.reduce((acc, r) => acc + r.targetPct, 0);
    const rows = sum !== 100 && sum > 0
      ? cleaned.map((r) => ({ ...r, targetPct: (r.targetPct / sum) * 100 }))
      : cleaned;

    // Tam replace: önce sil, sonra ekle
    await prisma.$transaction([
      prisma.targetAllocation.deleteMany({}),
      prisma.targetAllocation.createMany({
        data: rows.map((r) => ({ symbol: r.symbol, targetPct: r.targetPct })),
      }),
    ]);

    return NextResponse.json({ success: true, count: rows.length });
  } catch (err: any) {
    console.error("POST /api/targets error:", err);
    // Prisma tablo bulunamadı vb. durumlar için daha anlaşılır mesaj
    const msg =
      typeof err?.message === "string" && err.message.includes("targetAllocation")
        ? "Prisma model 'TargetAllocation' henüz migrate edilmemiş olabilir. Lütfen schema.prisma içinde modeli ekleyip `prisma migrate dev` çalıştırın."
        : "Failed to save targets";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const symbolRaw = body?.symbol;
    const targetPctRaw = body?.targetPct;

    if (typeof symbolRaw !== "string" || !Number.isFinite(Number(targetPctRaw))) {
      return NextResponse.json({ error: "Expected { symbol: string, targetPct: number }" }, { status: 400 });
    }

    const symbol = symbolRaw.toUpperCase().trim();
    const targetPct = Number(targetPctRaw);

    // upsert tek kaydı günceller/oluşturur
    const row = await prisma.targetAllocation.upsert({
      where: { id: symbol }, // Ensure `symbol` is the unique identifier or adjust accordingly
      create: { symbol, targetPct },
      update: { targetPct },
    });

    return NextResponse.json(row);
  } catch (err) {
    console.error("PUT /api/targets error:", err);
    return NextResponse.json({ error: "Failed to upsert target" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const symbolParam = url.searchParams.get("symbol");

    if (!symbolParam) {
      // sembol verilmezse tümünü silme opsiyonu güvenli değil → 400 dön
      return NextResponse.json({ error: "Missing symbol query param" }, { status: 400 });
    }

    const symbol = symbolParam.toUpperCase().trim();
    await prisma.targetAllocation.delete({ where: { id: symbol } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    // Eğer kayıt yoksa delete hata atabilir; bu durumda 204/ok dönebiliriz
    if (err?.code === "P2025") {
      return NextResponse.json({ success: true, note: "Already deleted" });
    }
    console.error("DELETE /api/targets error:", err);
    return NextResponse.json({ error: "Failed to delete target" }, { status: 500 });
  }
}