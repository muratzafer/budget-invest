import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Tek sembol için son fiyatı veya geçmiş verileri getirir
export async function GET(
  req: Request,
  { params }: { params: { symbol: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "1", 10);
    const history = searchParams.get("history") === "true";

    if (history) {
      // Belirli bir sembolün geçmiş fiyatlarını döndür
      const prices = await prisma.price.findMany({
        where: { symbol: params.symbol },
        orderBy: { createdAt: "desc" },
        take: limit > 0 ? limit : 50,
      });
      return NextResponse.json(prices);
    }

    // Sadece son fiyatı döndür
    const last = await prisma.price.findFirst({
      where: { symbol: params.symbol },
      orderBy: { createdAt: "desc" },
    });

    if (!last) {
      return NextResponse.json({ error: "No data found" }, { status: 404 });
    }

    return NextResponse.json(last);
  } catch (error) {
    console.error("GET /api/prices/[symbol] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch symbol data" },
      { status: 500 }
    );
  }
}

// Tek sembol için yeni fiyat verisi ekler
export async function POST(
  req: Request,
  { params }: { params: { symbol: string } }
) {
  try {
    const data = await req.json();

    // Birden fazla veri ekleme desteği
    if (Array.isArray(data)) {
      const result = await prisma.price.createMany({
        data: data.map((d) => ({
          ...d,
          symbol: params.symbol,
        })),
      });
      return NextResponse.json({
        message: `Added ${result.count} records for ${params.symbol}`,
      });
    }

    // Tek fiyat verisi ekleme
    const price = await prisma.price.create({
      data: { ...data, symbol: params.symbol },
    });
    return NextResponse.json(price);
  } catch (error) {
    console.error("POST /api/prices/[symbol] error:", error);
    return NextResponse.json(
      { error: "Failed to add price data" },
      { status: 500 }
    );
  }
}