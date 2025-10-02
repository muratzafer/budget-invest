"use client";

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

type Props = {
  categoryData: { name: string; value: number }[];
  totalExpenseValue: number;
  series: { key: string; label: string; income: number; expense: number; net: number }[];
  fmt: (n: number) => string;
  pct: (part: number, total: number) => string;
};

export default function ClientCharts({ categoryData, totalExpenseValue, series, fmt, pct }: Props) {
  // Birikimli seri hesapla (client tarafında)
  const cumulative = series.reduce<{ key: string; label: string; income: number; expense: number; net: number; cum: number }[]>(
    (acc, cur, idx) => {
      const prev = idx > 0 ? acc[idx - 1].cum : 0;
      acc.push({ ...cur, cum: prev + cur.net });
      return acc;
    },
    []
  );

  return (
    <>
      {/* 3 grafik: Pie, Line, Bar */}
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
                label={(entry) => pct(Number(entry.value ?? 0), totalExpenseValue)}
              >
                {categoryData.map((_, idx) => (
                  <Cell key={`cell-${idx}`} fill={`hsl(${(idx * 55) % 360},70%,60%)`} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => `₺ ${fmt(Number(v))}`} />
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
              <YAxis tickFormatter={(v) => fmt(Number(v))} />
              <Tooltip formatter={(v: number) => `₺ ${fmt(Number(v))}`} />
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
              <YAxis tickFormatter={(v) => fmt(Number(v))} />
              <Tooltip formatter={(v: number) => `₺ ${fmt(Number(v))}`} />
              <Legend />
              <Bar dataKey="value" name="Gider" fill="#dc2626">
                {categoryData.map((_, idx) => (
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
          <LineChart data={cumulative}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis tickFormatter={(v) => fmt(Number(v))} />
            <Tooltip formatter={(v: number) => `₺ ${fmt(Number(v))}`} />
            <Legend />
            <Line type="monotone" dataKey="cum" name="Birikimli Net" stroke="#7c3aed" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}