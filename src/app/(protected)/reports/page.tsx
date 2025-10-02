import { prisma } from "@/lib/db";

// Server Component: veriyi burada çekip, doğrudan render ediyoruz
export default async function ReportsPage() {
  // 1) Veriler
  const [txs, cats] = await Promise.all([
    prisma.transaction.findMany({
      select: {
        type: true,
        amount: true,
        categoryId: true,
        occurredAt: true,
      },
      orderBy: { occurredAt: "desc" },
    }),
    prisma.category.findMany({
      select: { id: true, name: true, type: true },
    }),
  ]);

  // 2) Toplamlar
  const income = txs
    .filter((t: { type: string; }) => t.type === "income")
    .reduce((a: number, t: { amount: any; }) => a + Number(t.amount || 0), 0);
  const expense = txs
    .filter((t: { type: string; }) => t.type === "expense")
    .reduce((a: number, t: { amount: any; }) => a + Number(t.amount || 0), 0);
  const net = income - expense;

  // 3) Gider kategorileri kırılımı
  const expenseCats = new Map<string, string>();
  for (const c of cats) if (c.type === "expense") expenseCats.set(c.id, c.name);

  const expenseTxs = txs.filter((t: { type: string; }) => t.type === "expense");
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

  // 4) Son 6 ay seri (gelir/gider)
  const today = new Date();
  const months: {
    key: string;
    label: string;
    from: Date;
    to: Date;
    income: number;
    expense: number;
  }[] = [];

  function startOfMonth(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  function endOfMonth(d: Date) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  }

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

  for (const t of txs) {
    const key = monthKey(new Date(t.occurredAt));
    const i = idx.get(key);
    if (i === undefined) continue;
    if (t.type === "income") months[i].income += Number(t.amount || 0);
    else months[i].expense += Number(t.amount || 0);
  }
  const series = months.map((m) => ({ ...m, net: m.income - m.expense }));

  // 5) Helpers
  const fmt = (n: number) =>
    new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n);
  const pctText = (v: number) => `${(v * 100).toFixed(1)}%`;

  // 6) Render (önceki görünüme daha yakın, kartlar + barlar + tablo)
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Raporlar</h1>

      {/* Özet Kartları */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border p-4 shadow-sm bg-white dark:bg-zinc-900">
          <div className="text-sm text-gray-500">Gelir</div>
          <div className="text-2xl font-semibold">₺ {fmt(income)}</div>
        </div>
        <div className="rounded-2xl border p-4 shadow-sm bg-white dark:bg-zinc-900">
          <div className="text-sm text-gray-500">Gider</div>
          <div className="text-2xl font-semibold">₺ {fmt(expense)}</div>
        </div>
        <div className="rounded-2xl border p-4 shadow-sm bg-white dark:bg-zinc-900">
          <div className="text-sm text-gray-500">Net</div>
          <div
            className={`text-2xl font-semibold ${
              net >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            ₺ {fmt(net)}
          </div>
        </div>
      </div>

      {/* Kategori Kırılımı */}
      <section className="rounded-2xl border p-4 shadow-sm bg-white dark:bg-zinc-900">
        <div className="mb-3 font-medium">Kategori Kırılımı (Gider)</div>
        {categoryData.length === 0 ? (
          <div className="text-sm text-gray-500">Veri yok.</div>
        ) : (
          <div className="space-y-3">
            {categoryData.map((c) => (
              <div key={c.id}>
                <div className="flex items-center justify-between text-sm">
                  <div className="font-medium">{c.name}</div>
                  <div className="tabular-nums">
                    ₺ {fmt(c.value)} <span className="text-gray-500">({pctText(c.ratio)})</span>
                  </div>
                </div>
                <div className="mt-1 h-2 w-full rounded bg-gray-200 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded bg-emerald-500"
                    style={{ width: `${Math.min(100, c.ratio * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Son 6 Ay */}
      <section className="rounded-2xl border p-4 shadow-sm bg-white dark:bg-zinc-900">
        <div className="mb-3 font-medium">Son 6 Ay</div>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
          {series.map((m) => (
            <div key={m.key} className="rounded-xl border p-3">
              <div className="text-xs text-gray-500 mb-1">{m.label}</div>
              <div className="text-[11px] text-gray-500">Gelir</div>
              <div className="text-sm font-semibold">₺ {fmt(m.income)}</div>
              <div className="mt-1 text-[11px] text-gray-500">Gider</div>
              <div className="text-sm font-semibold">₺ {fmt(m.expense)}</div>
              <div className="mt-1 text-[11px] text-gray-500">Net</div>
              <div
                className={`text-sm font-semibold ${
                  m.net >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                ₺ {fmt(m.net)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
