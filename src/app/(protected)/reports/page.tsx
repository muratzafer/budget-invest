import { prisma } from "@/lib/db";
export const revalidate = 0; // her istekte sunucuda yeniden hesapla
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import Link from "next/link";
import { Fragment } from "react";
import { Key, ReactElement, JSXElementConstructor, ReactNode, ReactPortal } from "react";


function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function fmt(n: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n);
}
function pct(part: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}
function ymOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: { month?: string; accountId?: string; categoryId?: string };
}) {
  // --- URL filtreleri ---
  const monthParam = searchParams?.month;
  const accountId = searchParams?.accountId || "";
  const categoryId = searchParams?.categoryId || "";

  // Tarih aralığı (ay)
  let from = startOfMonth();
  let to = endOfMonth();
  if (monthParam) {
    const [y, m] = monthParam.split("-").map(Number);
    if (y && m && m >= 1 && m <= 12) {
      from = new Date(y, m - 1, 1);
      to = endOfMonth(from);
    }
  }
  const monthValue = ymOf(from); // input[type=month] default value

  // Select verileri
  const [accounts, allCategories] = await Promise.all([
    prisma.account.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  // Ortak filtre
  const commonWhere: any = {
    occurredAt: { gte: from, lte: to },
    ...(accountId ? { accountId } : {}),
    ...(categoryId ? { categoryId } : {}),
  };

  // Özetler
  const [incomeAgg, expenseAgg] = await Promise.all([
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { ...commonWhere, type: "income" },
    }),
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { ...commonWhere, type: "expense" },
    }),
  ]);
  const income = Number(incomeAgg._sum.amount ?? 0);
  const expense = Number(expenseAgg._sum.amount ?? 0);
  const net = income - expense;

  // Kategori kırılımı (gider) — kategori filtresi seçildiyse bu liste anlamını yitirir, yine de tek kategori için değer gösterir.
  const byCat = await prisma.transaction.groupBy({
    by: ["categoryId"],
    _sum: { amount: true },
    where: { ...commonWhere, type: "expense" },
  });
  const catIds = byCat.map((x: { categoryId: any; }) => x.categoryId).filter(Boolean) as string[];
  const cats = catIds.length
    ? await prisma.category.findMany({ where: { id: { in: catIds } } })
    : [];
  const catName = (id: string | null) =>
    id ? cats.find((c: { id: string; }) => c.id === id)?.name ?? "(Diğer)" : "(Kategorisiz)";

  const categoryData = byCat
    .map((x: { categoryId: any; _sum: { amount: any; }; }) => ({
      name: catName(x.categoryId ?? null),
      value: Number(x._sum.amount ?? 0),
    }))
    .sort((a: { value: number; }, b: { value: number; }) => b.value - a.value);

  const totalExpenseValue = categoryData.reduce((acc: any, x: { value: any; }) => acc + x.value, 0);

  // Son 6 ay seri (gelir/gider) — seçili filtrelere göre
  const anchor = new Date(from);
  const months: { key: string; label: string; from: Date; to: Date }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    const f = startOfMonth(d);
    const t = endOfMonth(d);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = f.toLocaleDateString("tr-TR", { month: "short", year: "2-digit" });
    months.push({ key, label, from: f, to: t });
  }
  const series = await Promise.all(
    months.map(async (m) => {
      const base = { occurredAt: { gte: m.from, lte: m.to }, ...(accountId ? { accountId } : {}), ...(categoryId ? { categoryId } : {}) };
      const [inc, exp] = await Promise.all([
        prisma.transaction.aggregate({ _sum: { amount: true }, where: { ...base, type: "income" } }),
        prisma.transaction.aggregate({ _sum: { amount: true }, where: { ...base, type: "expense" } }),
      ]);
      const incomeVal = Number(inc._sum.amount ?? 0);
      const expenseVal = Number(exp._sum.amount ?? 0);
      return { key: m.key, label: m.label, income: incomeVal, expense: expenseVal, net: incomeVal - expenseVal };
    })
  );

  // CSV export (Excel-compatible). İki bölüm: "Son 6 Ay Seri" ve "Kategori Kırılımı"
  const csvRows: string[] = [];
  csvRows.push("=== Son 6 Ay ===");
  csvRows.push("Ay,Gelir,Gider,Net");
  for (const s of series) {
    csvRows.push([s.label, s.income, s.expense, s.net].join(","));
  }
  csvRows.push(""); // boş satır
  csvRows.push("=== Kategori Kırılımı (Gider) ===");
  csvRows.push("Kategori,Tutar,Yüzde");
  for (const row of categoryData) {
    csvRows.push([row.name, row.value, pct(row.value, totalExpenseValue)].join(","));
  }
  const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(csvRows.join("\n"));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Raporlar</h1>

      {/* --- Filtre Bar --- */}
      <form className="rounded-2xl border p-4 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4" method="get">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Ay</label>
          <input
            type="month"
            name="month"
            defaultValue={monthValue}
            className="w-full rounded border px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Hesap</label>
          <select name="accountId" defaultValue={accountId} className="w-full rounded border px-2 py-1">
            <option value="">(Hepsi)</option>
            {accounts.map((a: { id: any; name: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; }) => (
              <option key={String(a.id)} value={String(a.id)}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Kategori</label>
          <select name="categoryId" defaultValue={categoryId} className="w-full rounded border px-2 py-1">
            <option value="">(Hepsi)</option>
            {allCategories.map((c: { id: any; name: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; }) => (
              <option key={String(c.id ?? '')} value={String(c.id ?? '')}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-lg bg-gray-900 text-white px-4 py-2 hover:bg-black transition"
          >
            Uygula
          </button>
          <Link
            href="/reports"
            className="rounded-lg border px-4 py-2 hover:bg-gray-50 transition"
          >
            Temizle
          </Link>
          <a
            href={csvContent}
            download={`rapor-${monthValue}${accountId ? `-acc-${accountId}` : ""}${categoryId ? `-cat-${categoryId}` : ""}.csv`}
            className="rounded-lg border px-4 py-2 hover:bg-gray-50 transition"
          >
            CSV indir
          </a>
          <span className="hidden print:inline text-xs text-gray-500">Yazdırılıyor…</span>
          <span className="text-xs text-gray-500 print:hidden">(PDF için: Tarayıcı &gt; Yazdır)</span>
        </div>
      </form>

      {/* Özet kartları */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border p-4 shadow-sm">
          <div className="text-sm text-gray-500">Gelir</div>
          <div className="text-2xl font-semibold">₺ {fmt(income)}</div>
        </div>
        <div className="rounded-2xl border p-4 shadow-sm">
          <div className="text-sm text-gray-500">Gider</div>
          <div className="text-2xl font-semibold">₺ {fmt(expense)}</div>
        </div>
        <div className="rounded-2xl border p-4 shadow-sm">
          <div className="text-sm text-gray-500">Net</div>
          <div className={`text-2xl font-semibold ${net >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            ₺ {fmt(net)}
          </div>
        </div>
      </div>

      {/* Recharts görselleri */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Pasta grafik (kategori kırılımı) */}
        <div className="rounded-2xl border p-4 shadow-sm flex flex-col items-center">
          <div className="mb-2 font-semibold text-center">Kategori Kırılımı</div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={categoryData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={(entry) => pct(entry.value as number, totalExpenseValue)}
              >
                {categoryData.map((entry: any, idx: number) => (
                  <Cell key={`cell-${idx}`} fill={`hsl(${(idx * 55) % 360},70%,60%)`} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => `₺ ${fmt(v)}`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* 2. Çizgi grafik (son 6 ay gelir/gider) */}
        <div className="rounded-2xl border p-4 shadow-sm flex flex-col items-center">
          <div className="mb-2 font-semibold text-center">Aylık Gelir/Gider</div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={fmt} />
              <Tooltip formatter={(v: number) => `₺ ${fmt(v)}`} />
              <Legend />
              <Line type="monotone" dataKey="income" name="Gelir" stroke="#16a34a" />
              <Line type="monotone" dataKey="expense" name="Gider" stroke="#dc2626" />
              <Line type="monotone" dataKey="net" name="Net" stroke="#3b82f6" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {/* 3. Bar grafik (kategori bazlı giderler) */}
        <div className="rounded-2xl border p-4 shadow-sm flex flex-col items-center">
          <div className="mb-2 font-semibold text-center">Kategori Bazlı Giderler</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={categoryData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={fmt} />
              <Tooltip formatter={(v: number) => `₺ ${fmt(v)}`} />
              <Legend />
              <Bar dataKey="value" name="Gider" fill="#dc2626">
                {categoryData.map((entry: any, idx: number) => (
                  <Cell key={`cell-bar-${idx}`} fill={`hsl(${(idx * 55) % 360},70%,60%)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Birikimli Net (Cumulative) */}
      <div className="rounded-2xl border p-4 shadow-sm">
        <div className="mb-2 font-semibold text-center">Birikimli Net (Son 6 Ay)</div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={series.reduce((acc: any[], cur, idx) => {
              const prev = idx > 0 ? acc[idx - 1].cum : 0;
              acc.push({ ...cur, cum: prev + cur.net });
              return acc;
            }, [])}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis tickFormatter={fmt} />
            <Tooltip formatter={(v: number) => `₺ ${fmt(v)}`} />
            <Legend />
            <Line type="monotone" dataKey="cum" name="Birikimli Net" stroke="#7c3aed" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Tablolar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Kategori Tablosu */}
        <div className="rounded-2xl border p-4 shadow-sm overflow-auto">
          <div className="mb-3 font-medium">Kategori Kırılımı (Gider)</div>
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="py-1 pr-2">Kategori</th>
                <th className="py-1 pr-2 text-right">Tutar</th>
                <th className="py-1 pr-2 text-right">% Pay</th>
              </tr>
            </thead>
            <tbody>
              {categoryData.map((row: { name: boolean | Key | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; value: number; }) => (
                <tr key={String(row.name)} className="border-t">
                  <td className="py-1 pr-2">{row.name}</td>
                  <td className="py-1 pr-2 text-right">₺ {fmt(row.value)}</td>
                  <td className="py-1 pr-2 text-right">{pct(row.value, totalExpenseValue)}</td>
                </tr>
              ))}
              {categoryData.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-2 text-gray-500">Kayıt bulunamadı.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Son 6 Ay Tablosu */}
        <div className="rounded-2xl border p-4 shadow-sm overflow-auto">
          <div className="mb-3 font-medium">Son 6 Ay</div>
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="py-1 pr-2">Ay</th>
                <th className="py-1 pr-2 text-right">Gelir</th>
                <th className="py-1 pr-2 text-right">Gider</th>
                <th className="py-1 pr-2 text-right">Net</th>
                <th className="py-1 pr-2 text-right">Birikimli Net</th>
              </tr>
            </thead>
            <tbody>
              {series.reduce((acc: any[], cur, idx) => {
                const prev = idx > 0 ? acc[idx - 1].cum : 0;
                acc.push({ ...cur, cum: prev + cur.net });
                return acc;
              }, []).map((row) => (
                <tr key={row.key} className="border-t">
                  <td className="py-1 pr-2">{row.label}</td>
                  <td className="py-1 pr-2 text-right">₺ {fmt(row.income)}</td>
                  <td className="py-1 pr-2 text-right">₺ {fmt(row.expense)}</td>
                  <td className="py-1 pr-2 text-right">₺ {fmt(row.net)}</td>
                  <td className="py-1 pr-2 text-right">₺ {fmt(row.cum)}</td>
                </tr>
              ))}
              {series.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-2 text-gray-500">Kayıt bulunamadı.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        @media print {
          .border, .shadow-sm, .rounded-2xl { box-shadow: none !important; }
          a, button { display: none !important; }
        }
      `}</style>
    </div>
  );
}
