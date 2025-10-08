import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { Prisma } from "@prisma/client";

type SimplePrice = { symbol: string; price: number; asOf: string };

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

async function fetchYahooPrice(ySymbol: string): Promise<{ symbol: string; price: number; source: string } | null> {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ySymbol)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const quote = data?.quoteResponse?.result?.[0];
    const p = Number(quote?.regularMarketPrice ?? quote?.postMarketPrice ?? quote?.preMarketPrice);
    if (!Number.isFinite(p)) return null;
    return { symbol: ySymbol, price: p, source: "yahoo" };
  } catch {
    return null;
  }
}
// Map our symbols to Yahoo symbols when needed
function toYahooSymbol(sym: string): string | null {
  // BIST: THYAO.IS, ASELS.IS vs. zaten Yahoo formatında
  if (/^[A-Z]{3,6}\.IS$/.test(sym)) return sym;
  // FX pairs: USDTRY -> "USDTRY=X"
  if (/^[A-Z]{6}$/.test(sym)) return `${sym}=X`;
  // Metals like XAUUSD -> "XAUUSD=X"
  if (/^XAUUSD$|^XAGUSD$/.test(sym)) return `${sym}=X`;
  return null;
}
async function getLivePrice(symbol: string): Promise<{ symbol: string; price: number; source: string } | null> {
  // Prefer Binance for typical crypto tickers ending with USDT/USDC/TRY
  if (/(USDT|USDC|TRY)$/.test(symbol)) {
    try {
      const b = await fetchBinancePrice(symbol);
      if (Number.isFinite(b.price)) return { symbol: b.symbol, price: b.price, source: "binance" };
    } catch { /* fall through */ }
  }
  // Fallback to Yahoo Finance for equities, FX, metals
  const ySym = toYahooSymbol(symbol);
  if (ySym) {
    const y = await fetchYahooPrice(ySym);
    if (y && Number.isFinite(y.price)) return { symbol, price: y.price, source: "yahoo" };
  }
  // Last resort: try Yahoo with original symbol (for ETFs/indices already in Yahoo format)
  const y2 = await fetchYahooPrice(symbol);
  if (y2 && Number.isFinite(y2.price)) return { symbol, price: y2.price, source: "yahoo" };
  return null;
}

function toSimple(r: any): SimplePrice {
  const p = typeof r.price === "object" && r.price != null && "toString" in r.price ? Number(r.price.toString()) : Number(r.price);
  return { symbol: r.symbol, price: p, asOf: new Date(r.asOf).toISOString() };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const format = (searchParams.get("format") ?? "row").toLowerCase(); // 'row' | 'simple'
    const live = searchParams.get("live") === "1" || searchParams.get("mode") === "live";
    const persist = searchParams.get("persist") === "1" || searchParams.get("persist") === "true";

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

    // Live mode: fetch current prices from provider and (optionally) persist
    if (live) {
      if (!symbols || symbols.length === 0) {
        return NextResponse.json({ error: "symbols param required for live mode" }, { status: 400 });
      }
      const fetched = await Promise.all(symbols.map((s) => getLivePrice(s)));
      if (persist) {
        await prisma.price.createMany({
          data: fetched.filter(Boolean).map((r) => ({
            symbol: r!.symbol,
            price: new Prisma.Decimal(r!.price),
            asOf: new Date(),
            currency: "USD",
            source: r!.source,
          })),
        });
      }
      const nowIso = new Date().toISOString();
      const payload: SimplePrice[] = fetched.filter(Boolean).map((r) => ({ symbol: r!.symbol, price: r!.price, asOf: nowIso }));
      return NextResponse.json(payload);
    }

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
      const clean = rows.filter(Boolean) as any[];
      if (format === "simple") {
        return NextResponse.json(clean.map(toSimple));
      }
      return NextResponse.json(clean);
    }

    // Regular list
    const items = await prisma.price.findMany({
      where,
      orderBy: { asOf: "desc" },
      take: limit,
    });

    if (format === "simple") {
      return NextResponse.json(items.map(toSimple));
    }
    return NextResponse.json(items);
  } catch (err: any) {
    console.error("GET /api/prices error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to fetch prices" },
      { status: 500 }
    );
  }
}