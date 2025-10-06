import prisma from "@/lib/prisma";
import OrderForm from "./ui/OrderForm";

function fmtTRY(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(v);
}

export default async function Page() {
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
    (acc: number, h: any) => acc + Number(h.quantity ?? 0),
    0
  );
  const totalBook = holdings.reduce(
    (acc: number, h: any) =>
      acc + Number(h.quantity ?? 0) * Number(h.avgCost ?? 0),
    0
  );

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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
          <div className="text-xs text-muted-foreground">Maliyet (defter)</div>
          <div className="text-2xl font-semibold">{fmtTRY(totalBook)}</div>
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
                </tr>
              </thead>
              <tbody>
                {holdings.map((h: any) => {
                  const qty = Number(h.quantity ?? 0);
                  const avg = Number(h.avgCost ?? 0);
                  const book = qty * avg;
                  return (
                    <tr key={h.id} className="border-t">
                      <td className="py-2 pr-3">{h.account?.name ?? "—"}</td>
                      <td className="py-2 pr-3 font-medium">{h.symbol}</td>
                      <td className="py-2 pr-3 text-right">
                        {new Intl.NumberFormat("tr-TR").format(qty)}
                      </td>
                      <td className="py-2 pr-3 text-right">{fmtTRY(avg)}</td>
                      <td className="py-2 pr-3 text-right">{fmtTRY(book)}</td>
                    </tr>
                  );
                })}
              </tbody>
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
                      {fmtTRY(Number(o.price ?? 0))}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {o.fee != null ? fmtTRY(Number(o.fee)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}