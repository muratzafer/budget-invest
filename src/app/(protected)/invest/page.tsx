

import { prisma } from "@/lib/prisma";
import LivePricesClient from "./ui/LivePricesClient";
import HoldingsTable from "./ui/HoldingsTable";
import PortfolioOverview from "./ui/PortfolioOverview";
import type { TargetSlice } from "./ui/DCAPlansTable";
import DCAPlans from "./ui/DCAPlans";
import CashflowProjection from "./ui/CashflowProjection";
import PortfolioTimeSeries from "./ui/PortfolioTimeSeries";
import AiExplainPanel from "../reports/ui/AiExplainPanel";
import RagAnalyzePanel from "../reports/ui/RagAnalyzePanel";
import InvestActions from "./ui/InvestActions";
import TargetAllocationSection from "./ui/TargetAllocationSection";
import RebalanceSuggestions from "./ui/RebalanceSuggestions";

export const dynamic = "force-dynamic";

// Single source of truth for display currency
const BASE_CURRENCY = "TRY";

// ---- helpers ----
function toNumber(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

export default async function Page() {
  // --- load data ---
  const holdings = (await prisma.holding.findMany({
    orderBy: { symbol: "asc" },
    select: {
      symbol: true,
      quantity: true,
      avgCost: true,
    },
  })).map((h) => ({
    ...h,
    quantity: toNumber(h.quantity),
    avgCost: toNumber(h.avgCost),
  }));

  if (!holdings || holdings.length === 0) {
    return (
      <>
        <LivePricesClient symbols={[]} />
        <div className="rounded-2xl border p-6 shadow-sm mt-4">
          <div className="text-sm text-muted-foreground">Henüz portföy varlığı bulunmuyor.</div>
          <div className="mt-2 text-xs text-muted-foreground">
            Holding eklemek için “Invest” sayfasındaki formu kullanın.
          </div>
        </div>
      </>
    );
  }

  const symbols = Array.from(new Set(holdings.map((h) => h.symbol)));

  // Bring latest price for each symbol
  const prices = symbols.length
    ? await prisma.price.findMany({
        where: { symbol: { in: symbols } },
        orderBy: [{ symbol: "asc" }, { asOf: "desc" }],
        select: { symbol: true, price: true, asOf: true },
      })
    : [];

  const latestPriceBySymbol = new Map<string, number>();
  for (const p of prices) {
    if (!latestPriceBySymbol.has(p.symbol)) {
      latestPriceBySymbol.set(p.symbol, toNumber(p.price));
    }
  }

  // --- aggregate portfolio ---
  let totalPositions = 0;
  let totalQty = 0;
  let totalBook = 0; // cost basis
  let totalMarket = 0;

  for (const h of holdings) {
    const qty = toNumber(h.quantity);
    if (qty === 0) continue;
    totalPositions += 1;
    totalQty += qty;

    const avg = toNumber(h.avgCost);
    totalBook += qty * avg;

    const last = latestPriceBySymbol.get(h.symbol) ?? avg; // fall back to avg cost if no price yet
    totalMarket += qty * last;
  }

  const totalPnl = totalMarket - totalBook;

  const pnlClass = totalPnl >= 0 ? "text-emerald-600" : "text-rose-600";
  const diffPct = totalBook > 0 ? (totalPnl / totalBook) * 100 : 0;

  // --- weights for DCA/Targets ---
  const actualWeights: Record<string, number> = {};
  if (totalMarket > 0) {
    for (const h of holdings) {
      const qty = toNumber(h.quantity);
      if (!qty) continue;
      const last = latestPriceBySymbol.get(h.symbol) ?? toNumber(h.avgCost);
      const mv = qty * last;
      actualWeights[h.symbol] = (mv / totalMarket) * 100;
    }
  }
  // Derive default targets from current weights (can be replaced by DB-backed targets later)
  const targets: TargetSlice[] = Object.entries(actualWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([symbol, pct]) => ({ symbol, targetPct: pct }));


    // Load saved targets (DB) and fall back to derived weights if empty
const savedTargets = await prisma.targetAllocation.findMany({
  orderBy: { symbol: "asc" },
  select: { symbol: true, targetPct: true },
});

const finalTargets: TargetSlice[] =
  savedTargets.length > 0
    ? savedTargets.map((t) => ({ symbol: t.symbol, targetPct: Number(t.targetPct) }))
    : Object.entries(actualWeights)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([symbol, pct]) => ({ symbol, targetPct: pct }));

  // --- RAG-ish context for AI explain on Invest page ---
  const selectedMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  // Use current market value per symbol as a category-like breakdown
  const categoryLike = symbols.map((sym) => {
    // market value for this symbol
    let qty = 0;
    let avg = 0;
    for (const h of holdings) {
      if (h.symbol === sym) {
        qty = toNumber(h.quantity);
        avg = toNumber(h.avgCost);
        break;
      }
    }
    const last = latestPriceBySymbol.get(sym) ?? avg;
    const mv = qty * last;
    return { name: sym, expense: mv };
  }).sort((a, b) => b.expense - a.expense).slice(0, 12);

  // Load active DCA plans for cashflow projection
  const dcaPlans = await prisma.dCAPlan.findMany({
    where: { status: "active" },
    select: { id: true, name: true, symbol: true, amount: true, period: true, status: true, lastRunAt: true, nextRunAt: true },
    orderBy: [{ nextRunAt: "asc" }, { name: "asc" }],
  }).then(rows => rows.map(plan => ({
    id: String(plan.id),
    name: plan.name,
    symbol: plan.symbol,
    amount: Number(plan.amount),
    period: plan.period as any,
    status: plan.status as any,
    lastRunAt: plan.lastRunAt ? plan.lastRunAt.toISOString() : null,
    nextRunAt: plan.nextRunAt ? plan.nextRunAt.toISOString() : null,
  })));

  return (
    <>
      {/* Live price poller & broadcaster (client) */}
      <LivePricesClient symbols={symbols} />
      <PortfolioOverview
        totalPositions={totalPositions}
        totalQty={totalQty}
        totalBook={totalBook}
        totalMarket={totalMarket}
        totalPnl={totalPnl}
        diffPct={diffPct}
        baseCurrency={BASE_CURRENCY}
      />
      <InvestActions />
      <div className="mt-8">
        <HoldingsTable
          holdings={holdings}
          latestPriceBySymbol={Object.fromEntries(latestPriceBySymbol)}
          currency={BASE_CURRENCY}
        />
      </div>
      <div className="mt-8 space-y-8">


        <TargetAllocationSection
          currency="TRY"
          totalMarket={totalMarket}
          actualWeights={actualWeights}
        />

        <CashflowProjection
          currency={BASE_CURRENCY as any}
          horizonMonths={6}
          plans={dcaPlans}
        />

        <DCAPlans
          currency={BASE_CURRENCY as any}
          actualWeights={actualWeights}
        />

        <PortfolioTimeSeries days={60} currency={"TRY"} height={160} />

        <AiExplainPanel
          currency={BASE_CURRENCY as any}
          month={selectedMonth}
          totals={{ income: totalMarket, expense: totalBook, net: totalPnl }}
          categories={categoryLike}
          merchants={[]}
          sixMonth={[]}
        />
        <RagAnalyzePanel month={selectedMonth} />

        <RebalanceSuggestions
          currency={BASE_CURRENCY as any}
          totalMarket={totalMarket}
          actualWeights={actualWeights}   // { BTCUSDT: 35.2, ... }
          targets={finalTargets}            // [{ symbol: "BTCUSDT", targetPct: 40 }, ...]
          prices={Object.fromEntries([...latestPriceBySymbol])} // Map -> plain object
          minLot={{ BTCUSDT: 0.0001, ETHUSDT: 0.001 }}         // varsa
          cashAvailable={0}     // opsiyonel
        />

      </div>
    </>
  );
}