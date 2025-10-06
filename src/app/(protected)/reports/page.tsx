import { prisma } from "@/lib/db";
import CategoryBreakdown from "./ui/CategoryBreakdown";
import MonthlyTrend from "./ui/MonthlyTrend";
import TopMerchants from "./ui/TopMerchants";
import KpiCards from "./ui/KpiCards";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Server Component: veriyi burada çekip, doğrudan render ediyoruz
export default async function ReportsPage({ searchParams }: { searchParams?: { month?: string } }) {
  // Seçili ay (YYYY-MM). Yoksa bugünün ayı.
  function startOfMonth(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  function endOfMonth(d: Date) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  }
  const today = new Date();
  let from = startOfMonth(today);
  let to = endOfMonth(today);
  const selectedMonth =
    (typeof searchParams?.month === "string" && /^\d{4}-\d{2}$/.test(searchParams.month))
      ? searchParams!.month
      : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  if (selectedMonth) {
    const [y, m] = selectedMonth.split("-").map(Number);
    if (y && m && m >= 1 && m <= 12) {
      const base = new Date(y, m - 1, 1);
      from = startOfMonth(base);
      to = endOfMonth(base);
    }
  }




  // Seçilen aydan bir önceki ay aralığı
  const prevBase = new Date(from); // 'from' zaten seçilen ayın ilk günü
  const prevFrom = new Date(prevBase.getFullYear(), prevBase.getMonth() - 1, 1);
  const prevTo = new Date(prevFrom.getFullYear(), prevFrom.getMonth() + 1, 0, 23, 59, 59, 999);

  // 1) Veriler
  // a) Seçili ay için veriler (kartlar + kategori kırılımı)
  const [txsMonth, cats, prevIncomeAgg, prevExpenseAgg] = await Promise.all([
    prisma.transaction.findMany({
      select: { type: true, amount: true, categoryId: true, occurredAt: true, merchant: true },
      where: { occurredAt: { gte: from, lte: to } },
      orderBy: { occurredAt: "desc" },
    }),
    prisma.category.findMany({ select: { id: true, name: true, type: true } }),
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { type: "income", occurredAt: { gte: prevFrom, lte: prevTo } },
    }),
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { type: "expense", occurredAt: { gte: prevFrom, lte: prevTo } },
    }),
  ]);

  // b) Son 6 ay serisi için veriler
  const last6From = startOfMonth(new Date(today.getFullYear(), today.getMonth() - 5, 1));
  const txs6 = await prisma.transaction.findMany({
    select: { type: true, amount: true, occurredAt: true },
    where: { occurredAt: { gte: last6From, lte: endOfMonth(today) } },
    orderBy: { occurredAt: "asc" },
  });

  // 2) Toplamlar
  const income = txsMonth
    .filter((t: { type: string; }) => t.type === "income")
    .reduce((a: number, t: { amount: any; }) => a + Number(t.amount || 0), 0);
  const expense = txsMonth
    .filter((t: { type: string; }) => t.type === "expense")
    .reduce((a: number, t: { amount: any; }) => a + Number(t.amount || 0), 0);
  const net = income - expense;

  const prevIncome = Number(prevIncomeAgg._sum.amount ?? 0);
  const prevExpense = Number(prevExpenseAgg._sum.amount ?? 0);
  const prevNet = prevIncome - prevExpense;

  // 3) Gider kategorileri kırılımı
  const expenseCats = new Map<string, string>();
  for (const c of cats) if (c.type === "expense") expenseCats.set(c.id, c.name);

  const expenseTxs = txsMonth.filter((t: { type: string; }) => t.type === "expense");
  const totalExpenseValue = expenseTxs.reduce(
    (a: number, t: { amount: any; }) => a + Number(t.amount || 0),
    0
  );

  const agg = new Map<string, number>();
  for (const t of expenseTxs) {
    const key = t.categoryId ?? "uncategorized";
    agg.set(key, (agg.get(key) || 0) + Number(t.amount || 0));
  }

  const categoryData = Array.from(agg.entries())
    .map(([id, value]) => ({
      id,
      name: expenseCats.get(id) ?? (id === "uncategorized" ? "Kategorisiz" : "Diğer"),
      value,
      ratio: totalExpenseValue ? value / totalExpenseValue : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const categoryDataForClient = categoryData.map(c => ({ name: c.name, amount: c.value }));

  // 3b) En çok harcama yapılan Merchant'lar (o ay)
  const merchantAgg = new Map<string, number>();
  for (const t of expenseTxs) {
    const key = (t as any).merchant?.trim() || "—";
    merchantAgg.set(key, (merchantAgg.get(key) || 0) + Number((t as any).amount || 0));
  }
  const topMerchants = Array.from(merchantAgg.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const merchantData = topMerchants.map(m => ({
    merchant: m.name ?? "Diğer",
    total: Number(m.value ?? 0)
  }));

  // 4) Son 6 ay seri (gelir/gider)
  const months: {
    key: string;
    label: string;
    from: Date;
    to: Date;
    income: number;
    expense: number;
  }[] = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const from = startOfMonth(d);
    const to = endOfMonth(d);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = from.toLocaleDateString("tr-TR", {
      month: "short",
      year: "2-digit",
    });
    months.push({ key, label, from, to, income: 0, expense: 0 });
  }

  const idx = new Map(months.map((m, i) => [m.key, i] as const));
  const monthKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  for (const t of txs6) {
    const key = monthKey(new Date(t.occurredAt));
    const i = idx.get(key);
    if (i === undefined) continue;
    if (t.type === "income") months[i].income += Number(t.amount || 0);
    else months[i].expense += Number(t.amount || 0);
  }
  const series = months.map((m) => ({ ...m, net: m.income - m.expense }));

  // Recharts bileşeni için sade dizi
  const seriesForChart = series.map((m) => ({
    label: m.label,
    income: m.income,
    expense: m.expense,
    net: m.net,
  }));

  // 5) Helpers
  const fmt = (n: number) =>
    new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n);

  function deltaPct(curr: number, prev: number) {
    if (!prev && !curr) return 0;
    if (!prev) return 100;
    return ((curr - prev) / prev) * 100;
  }

  // 6) Render (önceki görünüme daha yakın, kartlar + barlar + tablo)
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Raporlar</h1>

      {/* Ay seçici */}
      <form className="mt-2" action="/reports" method="get">
        <label className="text-sm text-gray-600 dark:text-gray-400 mr-2">Ay:</label>
        <input
          type="month"
          name="month"
          defaultValue={selectedMonth}
          className="rounded border px-2 py-1 text-sm bg-white dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="ml-2 rounded border px-3 py-1 text-sm bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800"
        >
          Göster
        </button>
      </form>

      {/* Özet Kartları */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border p-4 shadow-sm bg-white dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">Gelir</div>
            <span className={`text-xs rounded px-1.5 py-0.5 ${deltaPct(income, prevIncome) >= 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"}`}>
              {deltaPct(income, prevIncome) >= 0 ? "▲" : "▼"} {Math.abs(deltaPct(income, prevIncome)).toFixed(1)}%
            </span>
          </div>
          <div className="text-2xl font-semibold">₺ {fmt(income)}</div>
          <div className="text-xs text-gray-500">Önceki ay: ₺ {fmt(prevIncome)}</div>
        </div>
        <div className="rounded-2xl border p-4 shadow-sm bg-white dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">Gider</div>
            <span className={`text-xs rounded px-1.5 py-0.5 ${deltaPct(expense, prevExpense) >= 0 ? "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"}`}>
              {deltaPct(expense, prevExpense) >= 0 ? "▲" : "▼"} {Math.abs(deltaPct(expense, prevExpense)).toFixed(1)}%
            </span>
          </div>
          <div className="text-2xl font-semibold">₺ {fmt(expense)}</div>
          <div className="text-xs text-gray-500">Önceki ay: ₺ {fmt(prevExpense)}</div>
        </div>
        <div className="rounded-2xl border p-4 shadow-sm bg-white dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">Net</div>
            <span className={`text-xs rounded px-1.5 py-0.5 ${deltaPct(net, prevNet) >= 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"}`}>
              {deltaPct(net, prevNet) >= 0 ? "▲" : "▼"} {Math.abs(deltaPct(net, prevNet)).toFixed(1)}%
            </span>
          </div>
          <div
            className={`text-2xl font-semibold ${
              net >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            ₺ {fmt(net)}
          </div>
          <div className="text-xs text-gray-500">Önceki ay: ₺ {fmt(prevNet)}</div>
        </div>
      </div>

      <KpiCards
        totalIncomeValue={income}
        totalExpenseValue={expense}
        netValue={net}
        transactionCount={txsMonth.length}
        currency="TRY"
      />

      {/* Kategori Kırılımı */}
      <section className="rounded-2xl border p-4 shadow-sm bg-white dark:bg-zinc-900">
        <div className="mb-3 font-medium">Kategori Kırılımı (Gider)</div>
        {categoryDataForClient.length === 0 ? (
          <div className="text-sm text-gray-500">Veri yok.</div>
        ) : (
          <CategoryBreakdown
            categoryData={categoryDataForClient}
            totalExpenseValue={totalExpenseValue}
          />
        )}
      </section>

      {/* En Çok Harcama Yapılan Merchant'lar (İlk 10) */}
      <section className="rounded-2xl border p-4 shadow-sm bg-white dark:bg-zinc-900">
        <div className="mb-3 font-medium">En Çok Harcama Yapılan Merchant'lar (İlk 10)</div>
        {topMerchants.length === 0 ? (
          <div className="text-sm text-gray-500">Veri yok.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500">
                <tr>
                  <th className="py-1 pr-2">Merchant</th>
                  <th className="py-1 text-right">Tutar</th>
                  <th className="py-1 text-right">% Pay</th>
                </tr>
              </thead>
              <tbody>
                {topMerchants.map((m) => {
                  const pct = totalExpenseValue ? (m.value / totalExpenseValue) * 100 : 0;
                  return (
                    <tr key={m.name} className="border-t">
                      <td className="py-1 pr-2">{m.name}</td>
                      <td className="py-1 text-right">₺ {fmt(m.value)}</td>
                      <td className="py-1 text-right">{pct.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Son 6 Ay */}
      <section className="rounded-2xl border p-4 shadow-sm bg-white dark:bg-zinc-900">
        <div className="mb-3 font-medium">Son 6 Ay (Gelir / Gider / Net)</div>
        {seriesForChart.length === 0 ? (
          <div className="text-sm text-gray-500">Veri yok.</div>
        ) : (
          <MonthlyTrend series={seriesForChart} />
        )}
      </section>
    </div>
  );
}
