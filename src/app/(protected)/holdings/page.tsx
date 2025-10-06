

import prisma from "@/lib/prisma";

type HoldingRow = {
  id: string;
  symbol: string;
  accountId: string | null;
  quantity: number;
  avgCost: number;
  currency: string;
};

function currencyFmt(n: number, currency = "TRY") {
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return new Intl.NumberFormat("tr-TR", {
      maximumFractionDigits: 2,
    }).format(n);
  }
}

export default async function Page() {
  // 1) Varlıkları çek
  const holdings = (await prisma.holding.findMany({
      orderBy: { symbol: "asc" },
      select: {
          id: true,
          symbol: true,
          accountId: true,
          quantity: true,
          avgCost: true,
          currency: true,
      },
  })) as unknown as HoldingRow[];

  // 2) Fiyatları en güncel olacak şekilde sembole göre al
  const symbols = Array.from(new Set(holdings.map((h) => h.symbol)));
  const latestPrices = await prisma.price.groupBy({
    by: ["symbol"],
    _max: { asOf: true },
    where: { symbol: { in: symbols } },
  });

  const latestBySymbol = new Map<string, Date>();
  latestPrices.forEach((g) => {
    latestBySymbol.set(g.symbol, g._max.asOf!);
  });

  const prices = await prisma.price.findMany({
    where: {
      OR: Array.from(latestBySymbol.entries()).map(([symbol, asOf]) => ({
        symbol,
        asOf,
      })),
    },
    select: { symbol: true, price: true, currency: true },
  });

  const priceMap = new Map<string, { price: number; currency: string }>();
  prices.forEach((p) => priceMap.set(p.symbol, { price: Number(p.price), currency: p.currency }));

  // 3) Satırları hesapla
  const rows = holdings.map((h) => {
    const last = priceMap.get(h.symbol);
    const lastPrice = last?.price ?? 0;
    const mkt = h.quantity * lastPrice;
    const cost = h.quantity * h.avgCost;
    const pnl = mkt - cost;
    return {
      ...h,
      lastPrice,
      marketValue: mkt,
      costValue: cost,
      pnl,
      displayCurrency: last?.currency ?? h.currency ?? "TRY",
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.market += r.marketValue;
      acc.cost += r.costValue;
      acc.pnl += r.pnl;
      return acc;
    },
    { market: 0, cost: 0, pnl: 0 }
  );

  const displayCurrency = rows[0]?.displayCurrency ?? "TRY";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Invest / Portföy</h1>

      {/* Özet */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 dark:bg-neutral-900 dark:border-neutral-800">
          <div className="text-sm text-gray-500">Toplam Piyasa Değeri</div>
          <div className="mt-1 text-lg font-medium">
            {currencyFmt(totals.market, displayCurrency)}
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4 dark:bg-neutral-900 dark:border-neutral-800">
          <div className="text-sm text-gray-500">Toplam Maliyet</div>
          <div className="mt-1 text-lg font-medium">
            {currencyFmt(totals.cost, displayCurrency)}
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4 dark:bg-neutral-900 dark:border-neutral-800">
          <div className="text-sm text-gray-500">Toplam P/L</div>
          <div
            className={`mt-1 text-lg font-medium ${
              totals.pnl >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {currencyFmt(totals.pnl, displayCurrency)}
          </div>
        </div>
      </div>

      {/* Tablo */}
      <div className="overflow-x-auto rounded-xl border bg-white dark:bg-neutral-900 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 dark:bg-neutral-800 dark:text-gray-300">
            <tr>
              <th className="p-2 text-left">Symbol</th>
              <th className="p-2 text-left">Hesap</th>
              <th className="p-2 text-right">Miktar</th>
              <th className="p-2 text-right">Ort. Maliyet</th>
              <th className="p-2 text-right">Son Fiyat</th>
              <th className="p-2 text-right">Piyasa Değeri</th>
              <th className="p-2 text-right">PNL</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t dark:border-neutral-800">
                <td className="p-2">{r.symbol}</td>
                <td className="p-2">{r.accountId ?? "—"}</td>
                <td className="p-2 text-right">{new Intl.NumberFormat("tr-TR").format(r.quantity)}</td>
                <td className="p-2 text-right">{currencyFmt(r.avgCost, r.displayCurrency)}</td>
                <td className="p-2 text-right">
                  {r.lastPrice ? currencyFmt(r.lastPrice, r.displayCurrency) : "—"}
                </td>
                <td className="p-2 text-right">{currencyFmt(r.marketValue, r.displayCurrency)}</td>
                <td
                  className={`p-2 text-right ${
                    r.pnl >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {currencyFmt(r.pnl, r.displayCurrency)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="p-4 text-center text-gray-500 dark:text-gray-400" colSpan={7}>
                  Kayıtlı pozisyon yok. Önce “Orders” ile alım/satım girişi yapabilirsin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}