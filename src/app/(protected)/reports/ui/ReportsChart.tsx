"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

type SeriesPoint = {
  label: string; // e.g., "Eki '24"
  income: number;
  expense: number;
};

type CategoryPoint = {
  name: string; // category name
  value: number; // summed expense for category
};

type ReportsChartProps = {
  series?: SeriesPoint[]; // last 6 months income/expense
  categoryData?: CategoryPoint[]; // category breakdown for current month
  currency?: string; // default TRY
};

const COLORS = [
  "#6366f1",
  "#22c55e",
  "#ef4444",
  "#f59e0b",
  "#06b6d4",
  "#8b5cf6",
  "#84cc16",
  "#f97316",
  "#14b8a6",
  "#eab308",
];

function useFormatter(currency = "TRY") {
  const fmtCurrency = React.useMemo(
    () =>
      new Intl.NumberFormat("tr-TR", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }),
    [currency]
  );

  const fmtNumber = React.useMemo(
    () => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }),
    []
  );

  return { fmtCurrency, fmtNumber };
}

export default function ReportsChart({
  series = [],
  categoryData = [],
  currency = "TRY",
}: ReportsChartProps) {
  const { fmtCurrency, fmtNumber } = useFormatter(currency);

  const totalExpenseValue =
    categoryData?.reduce((acc, c) => acc + (Number(c?.value) || 0), 0) || 0;

  const pieData =
    categoryData?.length
      ? categoryData.map((c) => ({
          name: c.name || "(Diğer)",
          value: Number(c.value) || 0,
        }))
      : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Line chart: Income vs Expense over months */}
      <div className="rounded-2xl border p-4 shadow-sm lg:col-span-2">
        <div className="mb-3 font-medium">Son 6 Ay – Gelir / Gider</div>
        {series?.length ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <XAxis dataKey="label" />
                <YAxis
                  tickFormatter={(v) => fmtNumber.format(Number(v))}
                  width={70}
                />
                <Tooltip
                  formatter={(value: any) => fmtCurrency.format(Number(value))}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="income"
                  name="Gelir"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="expense"
                  name="Gider"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm text-gray-500">Veri bulunamadı.</div>
        )}
      </div>

      {/* Pie chart: Category breakdown of expenses */}
      <div className="rounded-2xl border p-4 shadow-sm">
        <div className="mb-3 font-medium">Bu Ay – Kategori Kırılımı</div>

        {pieData.length ? (
          <>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={(d: any) =>
                      `${d.name} (${fmtNumber.format(d.value)})`
                    }
                  >
                    {pieData.map((_, idx) => (
                      <Cell
                        key={`cell-${idx}`}
                        fill={COLORS[idx % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any, name: any) =>
                      [fmtCurrency.format(Number(value)), name]
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 text-sm text-gray-600">
              Toplam Gider:{" "}
              <span className="font-medium">
                {fmtCurrency.format(totalExpenseValue)}
              </span>
            </div>
          </>
        ) : (
          <div className="text-sm text-gray-500">Bu ay için veri yok.</div>
        )}
      </div>
    </div>
  );
}