"use client";

import * as React from "react";

type CategoryRow = {
  name: string;
  amount: number;
};

type Props = {
  /** Array of categories with summed expense amounts for the selected month */
  categoryData: CategoryRow[];
  /** Total expense amount for the selected month (used to compute %s) */
  totalExpenseValue: number;
  /**
   * Optional formatter. If not provided, a TR-TR number formatter is used.
   * This keeps the component independent from server functions.
   */
  fmtValue?: (n: number) => string;
};

export default function CategoryBreakdown({
  categoryData,
  totalExpenseValue,
  fmtValue,
}: Props) {
  // Default number formatter (try to mirror server output but avoid passing functions from server)
  const fmt =
    fmtValue ??
    ((n: number) =>
      new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n));

  const percentage = React.useCallback(
    (part: number) => {
      if (!totalExpenseValue || totalExpenseValue <= 0) return "0%";
      const p = (part / totalExpenseValue) * 100;
      return `${p.toFixed(1)}%`;
    },
    [totalExpenseValue]
  );

  if (!categoryData || categoryData.length === 0) {
    return (
      <div className="rounded-2xl border p-4 shadow-sm">
        <div className="mb-3 font-medium">Kategori Kırılımı (Gider)</div>
        <div className="text-sm text-gray-500">Bu ay kayıt yok.</div>
      </div>
    );
  }

  const sorted = [...categoryData].sort(
    (a, b) => b.amount - a.amount
  );

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="mb-3 font-medium">Kategori Kırılımı (Gider)</div>

      <div className="space-y-3">
        {sorted.map((row) => (
          <div
            key={row.name}
            className="flex items-center justify-between gap-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="truncate text-sm">{row.name}</span>
                <span className="text-sm font-semibold">
                  ₺ {fmt(row.amount)}
                </span>
              </div>
              {/* Progress bar */}
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200/60 dark:bg-gray-800/60">
                <div
                  className="h-full rounded-full bg-emerald-500/80"
                  style={{
                    width: `${
                      totalExpenseValue > 0
                        ? Math.min(100, (row.amount / totalExpenseValue) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
              <div className="mt-1 text-[11px] text-gray-500">
                {percentage(row.amount)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}