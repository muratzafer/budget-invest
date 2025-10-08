

"use client";
import { useMemo } from "react";

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

  const months = useMemo(() => {
    return Array.from({ length: Math.max(1, horizonMonths) }, (_, i) => {
      const from = startOfMonth(addMonths(baseMonth, i));
      const to = endOfMonth(from);
      return { key: `${from.getFullYear()}-${from.getMonth() + 1}`.padStart(7, "0"), label: from.toLocaleDateString("tr-TR", { year: "numeric", month: "long" }), from, to };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizonMonths]);

  const rows = useMemo(() => {
    const totals: number[] = new Array(months.length).fill(0);

    for (const p of plans) {
      if (p.status !== "active") continue;
      const amount = Number(p.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      // Başlangıç tarihi: nextRunAt varsa onu baz al; yoksa bugünden
      let cursor = new Date(p.nextRunAt || now);
      // Çok geçmişse, bugüne yaklaştır (aşırı döngüyü engelle)
      if (cursor < addMonths(baseMonth, -3)) cursor = baseMonth; // güvenli kısayol

      for (let mi = 0; mi < months.length; mi++) {
        const { from, to } = months[mi];

        // Planın periyoduna göre bu ay içinde kaç kez çalışır?
        if (p.period === "monthly") {
          // Aylık: sadece ay başı veya nextRunAt sonrası ilk gün
          const first = new Date(cursor);
          // Eğer cursor bu aydan sonra ise bu ay için çalışmaz
          if (first <= to) {
            // Bu ay en az bir kez çalışır; ancak first < from ise bu ayın içinde bir kez say
            if (first <= to && (first >= from || cursor <= to)) {
              totals[mi] += amount;
            }
          }
          // Sonraki aylara geçmek için cursor'u ay sonrasına taşı
          cursor = addMonths(startOfMonth(first), 1);
        } else if (p.period === "weekly") {
          // Haftalık: haftalık adımlarla ay içinde kaç kez düştüğünü say
          let t = new Date(cursor);
          // Eğer t bu ayın başından önceyse ay başına çek
          if (t < from) t = from;
          while (t <= to) {
            totals[mi] += amount;
            t = addWeeks(t, 1);
          }
          // Sonraki ayın başına cursoru taşı
          cursor = addMonths(from, 1);
        } else {
          // daily
          let t = new Date(cursor);
          if (t < from) t = from;
          while (t <= to) {
            totals[mi] += amount;
            t = addDays(t, 1);
          }
          cursor = addMonths(from, 1);
        }
      }
    }

    const maxVal = Math.max(1, ...totals);
    return months.map((m, i) => ({
      label: m.label,
      total: totals[i],
      pct: (totals[i] / maxVal) * 100,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(plans), horizonMonths]);

  const grandTotal = rows.reduce((a, r) => a + r.total, 0);

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-medium">Nakit Akışı Projeksiyonu</div>
        <div className="text-xs text-gray-500">Toplam {fmtCurrency(grandTotal, currency)} / {horizonMonths} ay</div>
      </div>

      {/* mini alan grafiği (div barları) */}
      <div className="mb-4 grid grid-cols-12 gap-2">
        {rows.map((r, idx) => (
          <div key={idx} className="flex flex-col items-stretch">
            <div className="h-20 w-full rounded bg-gray-100 overflow-hidden">
              <div className="h-full" style={{ width: "100%", height: `${Math.max(4, r.pct)}%` }} />
            </div>
            <div className="mt-1 text-[10px] text-center text-gray-600 truncate">{r.label.split(" ")[0]}. {r.label.split(" ")[1]}</div>
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
              <td className="py-2 font-medium">Toplam ({horizonMonths} ay)</td>
              <td className="py-2 text-right font-medium">{fmtCurrency(grandTotal, currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}