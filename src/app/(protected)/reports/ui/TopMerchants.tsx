"use client";

import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type MerchantDatum = {
  merchant: string;   // display name
  total: number;      // total expense in base currency (e.g., TRY)
};

export default function TopMerchants({
  data,
  currency = "TRY",
  maxItems = 10,
  title = "En Çok Harcama Yapılan İş Yerleri",
}: {
  data: MerchantDatum[] | undefined;
  currency?: string;
  /** kaç adet en büyük öğe gösterilsin */
  maxItems?: number;
  title?: string;
}) {
  const fmt = React.useMemo(
    () =>
      new Intl.NumberFormat("tr-TR", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }),
    [currency]
  );

  if (!data || data.length === 0) {
    return (
      <div className="rounded-2xl border p-4 shadow-sm">
        <div className="mb-2 font-medium">{title}</div>
        <div className="text-sm text-gray-500">Veri bulunamadı.</div>
      </div>
    );
  }

  // En yüksekten küçüğe sırala, ilk N'i al
  const sorted = [...data]
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
    .slice(0, maxItems)
    // label'ları fazla uzun ise kısalt
    .map((d) => ({
      ...d,
      merchantLabel:
        d.merchant.length > 18 ? d.merchant.slice(0, 16) + "…" : d.merchant,
    }));

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="mb-3 font-medium">{title}</div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={sorted}
            margin={{ top: 8, right: 12, bottom: 8, left: 12 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="merchantLabel"
              tick={{ fontSize: 12 }}
              interval={0}
              height={50}
            />
            <YAxis
              tickFormatter={(v) => fmt.format(Number(v))}
              tick={{ fontSize: 12 }}
              width={80}
            />
            <Tooltip
              formatter={(value: any) => fmt.format(Number(value))}
              labelFormatter={(label) =>
                sorted.find((d) => d.merchantLabel === label)?.merchant ?? label
              }
            />
            <Bar dataKey="total" name="Tutar" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 text-xs text-gray-500">
        İlk {sorted.length} iş yeri gösteriliyor.
      </div>
    </div>
  );
}