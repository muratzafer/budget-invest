"use client";

import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export type Point = {
  label: string; // e.g., "Eyl '24"
  income: number;
  expense: number;
};

export type MonthlyTrendProps = {
  series?: Point[];
  currencySymbol?: string; // default "₺"
  className?: string;
};

export default function MonthlyTrend({
  series = [],
  currencySymbol = "₺",
  className = "",
}: MonthlyTrendProps) {
  const data = useMemo(() => {
    if (!Array.isArray(series)) return [] as (Point & { net: number })[];
    return series.map((s) => ({
      ...s,
      net: Number(s.income ?? 0) - Number(s.expense ?? 0),
    }));
  }, [series]);

  const money = useMemo(
    () =>
      (n: number) =>
        `${currencySymbol} ${new Intl.NumberFormat("tr-TR", {
          maximumFractionDigits: 2,
        }).format(Number(n ?? 0))}`,
    [currencySymbol]
  );

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border p-4 shadow-sm">
        <div className="text-sm text-gray-500">Aylık Trend</div>
        <div className="mt-2 text-sm text-gray-500">Gösterilecek veri yok.</div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${className}`}>
      <div className="mb-3 font-medium">Aylık Trend</div>
      <div className="h-64 md:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis tickFormatter={money} />
            <Tooltip
              formatter={(value: number) => money(Number(value))}
              labelFormatter={(l) => `Ay: ${l}`}
            />
            <Legend />
            <Line type="monotone" dataKey="income" name="Gelir" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="expense" name="Gider" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="net" name="Net" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}