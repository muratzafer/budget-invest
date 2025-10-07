import prisma from "@/lib/prisma";
import OrderForm from "./ui/OrderForm";
import HoldingActions from "./ui/HoldingActions";
import { unstable_noStore as noStore } from "next/cache";
import LivePrices from "./ui/LivePrices";


function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  if (typeof (v as any)?.toNumber === "function") {
    try { return (v as any).toNumber(); } catch { /* noop */ }
  }
  return Number(v as any);
}

function pct(numerator: number, denominator: number) {
  const d = Number(denominator ?? 0);
  if (!isFinite(d) || d === 0) return 0;
  return (Number(numerator ?? 0) / d) * 100;
}

function fmt(n: number | null | undefined, currency = "TRY") {
  const v = Number(n ?? 0);
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    // Fallback for non-ISO currencies (e.g. USDT, BTC)
    return `${new Intl.NumberFormat("tr-TR", {
      maximumFractionDigits: 2,
    }).format(v)} ${currency}`;
  }
}

export default async function Page() {
  noStore();
  // Hataları yüzeye çıkarmak yerine sayfada göstermek için try/catch ile güvenli istekler
  let error: string | null = null;

  // Hesaplar (OrderForm için)
  let accounts: { id: string; name: string }[] = [];
  try {
    accounts = await prisma.account.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  } catch (e: any) {
    error = `Hesaplar yüklenemedi: ${e?.message ?? String(e)}`;
  }

  // Mevcut portföy (holdings)
  let holdings: any[] = [];
  try {
    holdings = await prisma.holding.findMany({
      orderBy: [{ symbol: "asc" }],
      include: {
        account: { select: { id: true, name: true } },
      },
    });
  } catch (e: any) {
    if (!error) error = `Portföy yüklenemedi: ${e?.message ?? String(e)}`;
  }

  // En son fiyatlar (prices) — her sembol için en güncel kaydı al (sembol başına 1 sorgu)
  let priceMap: Record<string, number> = {};
  try {
    const symbols = Array.from(new Set(holdings.map((h: any) => h.symbol))).filter(Boolean);

    if (symbols.length > 0) {
      const latestList = await Promise.all(
        symbols.map((s) =>
          prisma.price.findFirst({
            where: { symbol: s },
            orderBy: { asOf: "desc" },
            select: { symbol: true, price: true },
          })
        )
      );
      for (const p of latestList) {
        if (!p) continue;
        priceMap[p.symbol] = toNum(p.price);
      }
    }
  } catch (e: any) {
    if (!error) error = `Fiyatlar yüklenemedi: ${e?.message ?? String(e)}`;
  }

  // Son işlemler (orders)
  let orders: any[] = [];
  try {
    orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  } catch (e: any) {
    if (!error) error = `Emirler yüklenemedi: ${e?.message ?? String(e)}`;
  }

  // Basit toplamlar
  const totalPositions = holdings.length;
  const totalQty = holdings.reduce(
    (acc: number, h: any) => acc + toNum(h.quantity),
    0
  );
  const totalBook = holdings.reduce(
    (acc: number, h: any) =>
      acc + toNum(h.quantity) * toNum(h.avgCost),
    0
  );
  const totalMarket = holdings.reduce(
    (acc: number, h: any) => {
      const qty = toNum(h.quantity);
      const last = toNum(priceMap[h.symbol]);
      return acc + qty * last;
    },
    0
  );
  const totalPnl = totalMarket - totalBook;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Invest</h1>
      <p className="text-sm text-muted-foreground">
        Hisse/kripto/borsa emirlerini gir, portföyünü ve geçmiş emirleri takip et.
      </p>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700">
          {error}
        </div>
      ) : null}

      {/* Özet kartları */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">Toplam Pozisyon</div>
          <div className="text-2xl font-semibold">{totalPositions}</div>
        </div>
        <div className="rounded-2xl border p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">Toplam Adet</div>
          <div className="text-2xl font-semibold">
            {new Intl.NumberFormat("tr-TR").format(totalQty)}
          </div>
        </div>
        <div className="rounded-2xl border p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">Maliyet (Defter)</div>
          <div className="text-2xl font-semibold">{fmt(totalBook, "TRY")}</div>
        </div>
        <div className="rounded-2xl border p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">Güncel Değer / Toplam P&amp;L</div>
          <div className="text-2xl font-semibold">
            {fmt(totalMarket, "TRY")}{" "}
            <span className={totalPnl >= 0 ? "text-emerald-600" : "text-rose-600"}>
              ({fmt(totalPnl, "TRY")})
            </span>
          </div>
        </div>
      </div>

      {/* Emir oluşturma */}
      <section className="rounded-2xl border p-5 space-y-4">
        <h2 className="text-lg font-medium">Yeni Emir</h2>
        <OrderForm accounts={accounts} />
      </section>

      {/* Portföy tablosu */}
      <section className="rounded-2xl border p-5 space-y-3">
        <h2 className="text-lg font-medium">Portföy</h2>
        {holdings.length === 0 ? (
          <div className="text-sm text-muted-foreground">Henüz pozisyon yok.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Hesap</th>
                  <th className="py-2 pr-3">Sembol</th>
                  <th className="py-2 pr-3 text-right">Adet</th>
                  <th className="py-2 pr-3 text-right">Ort. Maliyet</th>
                  <th className="py-2 pr-3 text-right">Defter Değeri</th>
                  <th className="py-2 pr-3 text-right">Son Fiyat</th>
                  <th className="py-2 pr-3 text-right">Piyasa Değeri</th>
                  <th className="py-2 pr-3 text-right">PNL</th>
                  <th className="py-2 pr-3 text-right">PNL %</th>
                  <th className="py-2 pr-3 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h: any) => {
                  const qty = toNum(h.quantity);
                  const avg = toNum(h.avgCost ?? 0);
                  const book = qty * avg;
                  const cur = h.currency ?? "TRY";
                  const last = toNum(priceMap[h.symbol]);
                  const market = last * qty;
                  const pnl = market - book;
                  const pnlPctVal = pct(last - avg, avg);
                  return (
                    <tr key={h.id} className="border-t">
                      <td className="py-2 pr-3">{h.account?.name ?? "—"}</td>
                      <td className="py-2 pr-3 font-medium">{h.symbol}</td>
                      <td className="py-2 pr-3 text-right">
                        {new Intl.NumberFormat("tr-TR").format(qty)}
                      </td>
                      <td className="py-2 pr-3 text-right">{fmt(avg, cur)}</td>
                      <td className="py-2 pr-3 text-right">{fmt(book, cur)}</td>
                      <td className="py-2 pr-3 text-right">{last ? fmt(last, cur) : "—"}</td>
                      <td className="py-2 pr-3 text-right">{last ? fmt(market, cur) : "—"}</td>
                      <td className={`py-2 pr-3 text-right ${pnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {fmt(pnl, cur)}
                      </td>
                      <td className={`py-2 pr-3 text-right ${pnlPctVal >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(pnlPctVal)}%
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <HoldingActions
                          holding={{
                            id: h.id,
                            symbol: h.symbol,
                            quantity: qty,
                            avgCost: avg,
                            accountId: h.accountId,
                            currency: cur,
                            marketPrice: last || 0,
                            marketValue: (last || 0) * qty,
                            pnl: market - book,
                            pnlPct: pct(last - avg, avg),
                            avgPrice: avg,
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t font-medium">
                  <td className="py-2 pr-3" colSpan={4}>Toplam</td>
                  <td className="py-2 pr-3 text-right">{fmt(totalBook, "TRY")}</td>
                  <td className="py-2 pr-3 text-right">—</td>
                  <td className="py-2 pr-3 text-right">{fmt(totalMarket, "TRY")}</td>
                  <td className={`py-2 pr-3 text-right ${totalPnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {fmt(totalPnl, "TRY")}
                  </td>
                  <td className="py-2 pr-3 text-right">—</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Son 20 Emir */}
      <section className="rounded-2xl border p-5 space-y-3">
        <h2 className="text-lg font-medium">Son Emirler</h2>
        {orders.length === 0 ? (
          <div className="text-sm text-muted-foreground">Henüz emir girilmemiş.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Tarih</th>
                  <th className="py-2 pr-3">Hesap</th>
                  <th className="py-2 pr-3">Sembol</th>
                  <th className="py-2 pr-3">Yön</th>
                  <th className="py-2 pr-3 text-right">Adet</th>
                  <th className="py-2 pr-3 text-right">Fiyat</th>
                  <th className="py-2 pr-3 text-right">Komisyon</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o: any) => (
                  <tr key={o.id} className="border-t">
                    <td className="py-2 pr-3">
                      {o.occurredAt
                        ? new Date(o.occurredAt).toLocaleString("tr-TR")
                        : new Date(o.createdAt).toLocaleString("tr-TR")}
                    </td>
                    <td className="py-2 pr-3">
                      {accounts.find((a) => a.id === (o as any).accountId)?.name ?? "—"}
                    </td>
                    <td className="py-2 pr-3 font-medium">{o.symbol}</td>
                    <td className="py-2 pr-3">
                      {o.side?.toUpperCase?.() ?? o.side ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {new Intl.NumberFormat("tr-TR", {
                        maximumFractionDigits: 8,
                      }).format(Number(o.quantity ?? 0))}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {fmt(Number(o.price ?? 0), "TRY")}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {o.fee != null ? fmt(Number(o.fee), "TRY") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <LivePrices
        symbols={[...new Set(holdings.map((h: any) => h.symbol).filter(Boolean))]}
        currency="USDT"
        flushMs={1500}
      />
    </div>
  );
}