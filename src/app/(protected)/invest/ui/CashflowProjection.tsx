

"use client";
import { useMemo, useState, useCallback } from "react";

export type Period = "daily" | "weekly" | "monthly";
export type DCAPlanLite = {
  id: string;
  name: string;
  symbol: string;
  amount: number; // base currency
  period: Period;
  status: "active" | "paused";
  lastRunAt?: string | null;
  nextRunAt?: string | null;
};

export type CashflowProjectionProps = {
  plans: DCAPlanLite[];
  currency?: "TRY" | "USD" | "EUR";
  horizonMonths?: number; // ileriye dönük kaç ay
};

function fmtCurrency(v: number, ccy: CashflowProjectionProps["currency"]) {
  const val = Number(v ?? 0);
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: ccy ?? "TRY", maximumFractionDigits: 2 }).format(val);
  } catch {
    return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(val)} ${ccy ?? "TRY"}`;
  }
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function addWeeks(d: Date, n: number) {
  return addDays(d, n * 7);
}
function addMonths(d: Date, n: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

export default function CashflowProjection({ plans, currency = "TRY", horizonMonths = 6 }: CashflowProjectionProps) {
  const now = new Date();
  const baseMonth = startOfMonth(now);

  const [rangeMonths, setRangeMonths] = useState<number>(horizonMonths);

  const months = useMemo(() => {
    return Array.from({ length: Math.max(1, rangeMonths) }, (_, i) => {
      const from = startOfMonth(addMonths(baseMonth, i));
      const to = endOfMonth(from);
      return {
        key: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`,
        label: from.toLocaleDateString("tr-TR", { year: "numeric", month: "long" }),
        from,
        to,
      };
    });
  }, [rangeMonths, baseMonth]);

  const [includePaused, setIncludePaused] = useState(false);

  function countOccurrences(period: Period, startAt: Date, from: Date, to: Date) {
    // Start at the later of startAt and from
    let t = new Date(Math.max(startAt.getTime(), from.getTime()));
    if (t > to) return 0;
    let c = 0;
    if (period === "daily") {
      while (t <= to) {
        c++;
        t = addDays(t, 1);
      }
      return c;
    }
    if (period === "weekly") {
      while (t <= to) {
        c++;
        t = addWeeks(t, 1);
      }
      return c;
    }
    // monthly
    while (t <= to) {
      c++;
      t = addMonths(startOfMonth(t), 1);
    }
    return c;
  }

  const rows = useMemo(() => {
    const totals: number[] = new Array(months.length).fill(0);

    for (const p of plans) {
      if (!includePaused && p.status !== "active") continue;
      const amount = Number(p.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      // Use nextRunAt if provided; otherwise today
      const anchor = p.nextRunAt ? new Date(p.nextRunAt) : now;

      for (let mi = 0; mi < months.length; mi++) {
        const { from, to } = months[mi];
        const occ = countOccurrences(p.period, anchor, from, to);
        if (occ > 0) totals[mi] += occ * amount;
      }
    }

    const maxVal = Math.max(1, ...totals);
    return months.map((m, i) => ({
      label: m.label,
      total: totals[i],
      pct: (totals[i] / maxVal) * 100,
    }));
  }, [plans, months, includePaused]);

  const grandTotal = rows.reduce((a, r) => a + r.total, 0);

  const exportCsv = useCallback((data: { label: string; total: number }[]) => {
    const header = "Ay,Toplam\n";
    const body = data.map((r) => `${r.label},${r.total}`).join("\n");
    const csv = header + body;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cashflow_${rangeMonths}ay.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [rangeMonths]);

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-medium">Nakit Akışı Projeksiyonu</div>
        <div className="flex items-center gap-3 text-xs text-gray-700">
          <label className="inline-flex items-center gap-1">
            <span>Ay:</span>
            <select
              value={rangeMonths}
              onChange={(e) => setRangeMonths(Number(e.target.value))}
              className="rounded border px-2 py-1"
            >
              <option value={3}>3</option>
              <option value={6}>6</option>
              <option value={12}>12</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-1">
            <input type="checkbox" checked={includePaused} onChange={(e) => setIncludePaused(e.target.checked)} />
            Durdurulanları Dahil Et
          </label>
          <div className="text-gray-500">Toplam {fmtCurrency(grandTotal, currency)} / {rangeMonths} ay</div>
          <button
            type="button"
            onClick={() => exportCsv(rows)}
            className="rounded border px-2 py-1 hover:bg-gray-50"
            title="CSV olarak indir"
          >CSV</button>
        </div>
      </div>

      {/* mini alan grafiği (div barları) */}
      <div className="mb-4 grid grid-cols-12 gap-2">
        {rows.map((r, idx) => (
          <div key={idx} className="flex flex-col items-stretch" title={`${r.label}: ${fmtCurrency(r.total, currency)}`}>
            <div className="h-20 w-full rounded bg-gray-100 overflow-hidden">
              <div className="h-full bg-gray-400/70" style={{ width: "100%", height: `${Math.max(4, r.pct)}%` }} />
            </div>
            <div className="mt-1 text-[10px] text-center text-gray-600 truncate">
              {r.label.split(" ")[0]}. {r.label.split(" ")[1]}
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2">Ay</th>
              <th className="py-2 text-right">Toplam Yatırım</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-2">{r.label}</td>
                <td className="py-2 text-right">{fmtCurrency(r.total, currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="py-2 font-medium">Toplam ({rangeMonths} ay)</td>
              <td className="py-2 text-right font-medium">{fmtCurrency(grandTotal, currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}