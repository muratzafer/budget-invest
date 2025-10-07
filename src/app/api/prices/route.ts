import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { Prisma } from "@prisma/client";

// ---- Validation ----
const PriceCreateSchema = z.object({
  symbol: z.string().min(1),
  price: z.number().finite(),
  asOf: z.string().datetime().optional(), // ISO string
  currency: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
});

const BulkSchema = z.array(PriceCreateSchema).min(1);

// ---- POST /api/prices ----
// Accepts either a single object or an array for bulk insert
export async function POST(req: Request) {
  try {
    const raw = await req.json();

    // Bulk insert
    if (Array.isArray(raw)) {
      const rows = BulkSchema.parse(raw).map((r) => ({
        symbol: r.symbol,
        price: new Prisma.Decimal(r.price),
        asOf: r.asOf ? new Date(r.asOf) : new Date(),
        currency: r.currency ?? "USD",
        source: r.source ?? "manual",
      }));

      // Note: we intentionally do not use skipDuplicates for maximum compatibility
      const result = await prisma.price.createMany({ data: rows });
      return NextResponse.json({ inserted: result.count }, { status: 201 });
    }

    // Single insert
    const { symbol, price, asOf, currency, source } = PriceCreateSchema.parse(raw);

    const created = await prisma.price.create({
      data: {
        symbol,
        price: new Prisma.Decimal(price),
        asOf: asOf ? new Date(asOf) : new Date(),
        currency: currency ?? "USD",
        source: source ?? "manual",
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    const message = err?.message ?? "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// ---- External fetch helpers (Binance REST) ----
function toBinanceSymbol(sym: string) {
  // Accepts symbols like BTCUSDT, btcusdt, BTC/USDT -> returns BTCUSDT
  return sym.replace("/", "").toUpperCase();
}

async function fetchBinancePrice(symbol: string) {
  const bnSym = toBinanceSymbol(symbol);
  const url = `https://api.binance.com/api/v3/ticker/price?symbol=${bnSym}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Binance price fetch failed for ${bnSym}`);
  const json: { symbol: string; price: string } = await res.json();
  const num = Number(json.price);
  if (!Number.isFinite(num)) throw new Error(`Invalid Binance price for ${bnSym}`);
  return { symbol: bnSym, price: num };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const symbolParam = searchParams.get("symbol") ?? undefined;
    const symbolsParam = searchParams.get("symbols") ?? undefined;
    const latest = searchParams.get("latest") === "1" || searchParams.get("latest") === "true";
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limit = Math.min(Number(searchParams.get("limit") ?? 20), 500);

    const symbols = symbolsParam
      ? symbolsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : symbolParam
      ? [symbolParam]
      : undefined;

    // Optional: refresh from Binance and persist before returning results
    const refresh = searchParams.get("refresh"); // e.g. refresh=binance
    if (refresh === "binance" && symbols && symbols.length > 0) {
      const fetched = await Promise.all(symbols.map((s) => fetchBinancePrice(s)));
      // insert rows (one per symbol) with source=binance, currency left unspecified -> default USD
      await prisma.price.createMany({
        data: fetched.map((r) => ({
          symbol: r.symbol,
          price: new Prisma.Decimal(r.price),
          asOf: new Date(),
          currency: "USD",
          source: "binance",
        })),
      });
    }

    // Build where clause
    const where: any = {};
    if (symbols && symbols.length > 0) where.symbol = { in: symbols.map(toBinanceSymbol) };
    if (from || to) {
      where.asOf = {} as any;
      if (from) (where.asOf as any).gte = new Date(from);
      if (to) (where.asOf as any).lte = new Date(to);
    }

    // Latest per symbol: we can't distinct-on with SQLite easily, so fetch per symbol
    if (latest && symbols && symbols.length > 0) {
      const rows = await Promise.all(
        symbols.map((s) =>
          prisma.price.findFirst({ where: { ...where, symbol: toBinanceSymbol(s) }, orderBy: { asOf: "desc" } })
        )
      );
      return NextResponse.json(rows.filter(Boolean));
    }

    // Regular list
    const items = await prisma.price.findMany({
      where,
      orderBy: { asOf: "desc" },
      take: limit,
    });

    return NextResponse.json(items);
  } catch (err: any) {
    console.error("GET /api/prices error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to fetch prices" },
      { status: 500 }
    );
  }
}