"use client";
import React from "react";

export type RebalanceSuggestionsProps = {
  currency?: "TRY" | "USD" | "EUR";
  totalMarket: number; // toplam portföy piyasa değeri (base currency)
  actualWeights: Record<string, number>; // {SYM: %}
  targets: Array<{ symbol: string; targetPct: number }>; // hedef %
};

function fmtCurrency(v: number, ccy: RebalanceSuggestionsProps["currency"]) {
  const val = Number(v ?? 0);
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: ccy ?? "TRY", maximumFractionDigits: 2 }).format(val);
  } catch {
    return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(val)} ${ccy ?? "TRY"}`;
  }
}

export default function RebalanceSuggestions({ currency = "TRY", totalMarket, actualWeights, targets }: RebalanceSuggestionsProps) {
  // Hedefin altında kalanları ve tamamlamak için tahmini tutarı hesapla
  const rows = targets
    .map((t) => {
      const actual = Number(actualWeights[t.symbol] ?? 0);
      const deficitPct = Math.max(0, Number(t.targetPct) - actual);
      const buyAmount = (deficitPct / 100) * Number(totalMarket || 0);
      return {
        symbol: t.symbol,
        targetPct: Number(t.targetPct),
        actualPct: actual,
        deficitPct,
        buyAmount,
      };
    })
    .filter((r) => r.deficitPct > 0.01) // %0.01 altı gürültüyü gösterme
    .sort((a, b) => b.buyAmount - a.buyAmount);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-medium">Hedefe Göre Eksikler (Öneri)</div>
        <div className="text-xs text-gray-500">Toplam piyasa: {fmtCurrency(totalMarket, currency)}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2">Sembol</th>
              <th className="py-2 text-right">Gerçekleşen %</th>
              <th className="py-2 text-right">Hedef %</th>
              <th className="py-2 text-right">Açık %</th>
              <th className="py-2 text-right">Tamamlama Tutarı</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol} className="border-b last:border-0">
                <td className="py-2 font-mono">{r.symbol}</td>
                <td className="py-2 text-right">{r.actualPct.toFixed(2)}%</td>
                <td className="py-2 text-right">{r.targetPct.toFixed(2)}%</td>
                <td className="py-2 text-right">{r.deficitPct.toFixed(2)}%</td>
                <td className="py-2 text-right">{fmtCurrency(r.buyAmount, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-xs text-gray-500">
        Not: Bu tutarlar yalnızca bilgilendirme amaçlıdır. Uygulama sırasında fiyat kayması ve komisyon etkileri olabilir.
      </div>
    </div>
  );
}
