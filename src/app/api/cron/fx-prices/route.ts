import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const FX_PAIRS: Array<{ base: string; quote: string }> = [
  { base: "USD", quote: "TRY" },
  { base: "EUR", quote: "TRY" },
  { base: "USD", quote: "EUR" },
  { base: "USD", quote: "GBP" },
];

const FX_API_URL = "https://open.er-api.com/v6/latest/USD";
const FX_SOURCE = "open.er-api.com";

const GOLD_TARGETS: Array<{ quote: "usd" | "try"; symbol: string; currency: string }> = [
  { quote: "usd", symbol: "XAUUSD", currency: "USD" },
  { quote: "try", symbol: "XAUTRY", currency: "TRY" },
];
const GOLD_API_URL = "https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd,try";
const GOLD_SOURCE = "coingecko-paxg";

export const dynamic = "force-dynamic";

function computePairPrice(
  rates: Record<string, number>,
  base: string,
  quote: string,
): number | null {
  const normBase = base.toUpperCase();
  const normQuote = quote.toUpperCase();
  const usdToBase = normBase === "USD" ? 1 : rates[normBase];
  const usdToQuote = normQuote === "USD" ? 1 : rates[normQuote];

  if (!Number.isFinite(usdToBase) || usdToBase === 0) return null;
  if (!Number.isFinite(usdToQuote)) return null;

  const price = usdToQuote / usdToBase;
  return Number.isFinite(price) ? price : null;
}

async function fetchFxRates(): Promise<Record<string, number>> {
  const res = await fetch(FX_API_URL, {
    cache: "no-store",
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new Error(`FX API request failed with ${res.status}`);
  }
  const json = (await res.json()) as any;
  if (json?.result !== "success" || typeof json?.rates !== "object") {
    throw new Error("Unexpected FX API response");
  }
  return json.rates as Record<string, number>;
}

async function fetchGoldPrices(): Promise<Record<string, number>> {
  const res = await fetch(GOLD_API_URL, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new Error(`Gold API request failed with ${res.status}`);
  }
  const json = (await res.json()) as any;
  const payload = json?.["pax-gold"];
  if (!payload) {
    throw new Error("Unexpected gold API response shape");
  }
  const out: Record<string, number> = {};
  for (const { quote } of GOLD_TARGETS) {
    const val = Number(payload?.[quote]);
    if (Number.isFinite(val)) {
      out[quote.toUpperCase()] = val;
    }
  }
  return out;
}

export async function GET() {
  try {
    const [rates, gold] = await Promise.allSettled([fetchFxRates(), fetchGoldPrices()]);

    const now = new Date();
    const rows: Array<{
      symbol: string;
      price: Prisma.Decimal;
      currency: string;
      source: string;
    }> = [];

    if (rates.status === "fulfilled") {
      for (const pair of FX_PAIRS) {
        const price = computePairPrice(rates.value, pair.base, pair.quote);
        if (price == null) continue;
        rows.push({
          symbol: `${pair.base.toUpperCase()}${pair.quote.toUpperCase()}`,
          price: new Prisma.Decimal(price),
          currency: pair.quote.toUpperCase(),
          source: FX_SOURCE,
        });
      }
    }

    if (gold.status === "fulfilled") {
      for (const target of GOLD_TARGETS) {
        const val = gold.value[target.quote.toUpperCase()];
        if (!Number.isFinite(val)) continue;
        rows.push({
          symbol: target.symbol,
          price: new Prisma.Decimal(val),
          currency: target.currency,
          source: GOLD_SOURCE,
        });
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "No prices fetched" }, { status: 502 });
    }

    const created = await prisma.price.createMany({
      data: rows.map((row) => ({
        ...row,
        asOf: now,
      })),
    });

    return NextResponse.json({
      inserted: created.count,
      fxPairs: rows.map((r) => r.symbol),
      warnings: [
        rates.status === "rejected" ? `FX fetch failed: ${rates.reason}` : null,
        gold.status === "rejected" ? `Gold fetch failed: ${gold.reason}` : null,
      ].filter(Boolean),
    });
  } catch (err: any) {
    console.error("[cron/fx-prices] error", err);
    return NextResponse.json({ error: err?.message ?? "Failed" }, { status: 500 });
  }
}
