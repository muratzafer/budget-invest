"use client";
import React from "react";

export type RebalanceSuggestionsProps = {
  currency?: "TRY" | "USD" | "EUR";
  totalMarket: number; // toplam portföy piyasa değeri (base currency)
  actualWeights: Record<string, number>; // {SYM: %}
  targets: Array<{ symbol: string; targetPct: number }>; // hedef %
  // --- optional & backward‑compatible ---
  prices?: Record<string, number>; // {SYM: lastPrice (base ccy)}
  minLot?: Record<string, number>; // {SYM: lotSize}, default 1
  cashAvailable?: number; // eldeki nakit (base ccy) — önerileri bu üst sınırla karşılaştırır
};

function fmtCurrency(v: number, ccy: RebalanceSuggestionsProps["currency"]) {
  const val = Number(v ?? 0);
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: ccy ?? "TRY", maximumFractionDigits: 2 }).format(val);
  } catch {
    return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(val)} ${ccy ?? "TRY"}`;
  }
}

function safeNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}
function roundToLot(qty: number, lot: number) {
  const l = lot && lot > 0 ? lot : 1;
  return Math.ceil(qty / l) * l; // yukarı yuvarla
}

export default function RebalanceSuggestions({ currency = "TRY", totalMarket, actualWeights, targets, prices = {}, minLot = {}, cashAvailable }: RebalanceSuggestionsProps) {
  // Hedefin altında kalanları ve tamamlamak için tahmini tutarı/adetini hesapla
  const rows = targets
    .map((t) => {
      const actual = safeNum(actualWeights[t.symbol]);
      const target = safeNum(t.targetPct);
      const deficitPct = Math.max(0, target - actual);
      const buyAmount = (deficitPct / 100) * safeNum(totalMarket);
      const px = safeNum(prices[t.symbol]);
      const lot = safeNum(minLot[t.symbol]) || 1;
      const rawQty = px > 0 ? buyAmount / px : 0;
      const buyQty = px > 0 ? roundToLot(rawQty, lot) : 0;
      const buyCost = px > 0 ? buyQty * px : buyAmount; // fiyat yoksa tutarı göster
      return {
        symbol: t.symbol,
        targetPct: target,
        actualPct: actual,
        deficitPct,
        price: px > 0 ? px : undefined,
        lot,
        buyAmount,
        buyQty,
        buyCost,
      };
    })
    .filter((r) => r.deficitPct > 0.01) // %0.01 altı gürültüyü gösterme
    .sort((a, b) => b.buyCost - a.buyCost);

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
              <th className="py-2 text-right">Fiyat</th>
              <th className="py-2 text-right">Adet</th>
              <th className="py-2 text-right">Tahmini Tutar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol} className="border-b last:border-0">
                <td className="py-2 font-mono">{r.symbol}</td>
                <td className="py-2 text-right">{r.actualPct.toFixed(2)}%</td>
                <td className="py-2 text-right">{r.targetPct.toFixed(2)}%</td>
                <td className="py-2 text-right">{r.deficitPct.toFixed(2)}%</td>
                <td className="py-2 text-right">{r.price ? fmtCurrency(r.price, currency) : "—"}</td>
                <td className="py-2 text-right">{r.buyQty ? r.buyQty.toLocaleString("tr-TR") : "—"}{r.lot && r.lot !== 1 ? <span className="ml-1 text-[10px] text-gray-500">(lot {r.lot})</span> : null}</td>
                <td className="py-2 text-right">{fmtCurrency(r.buyCost, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-xs text-gray-600 space-y-1">
        <div>
          Not: Bu tutarlar yalnızca bilgilendirme amaçlıdır. Uygulama sırasında fiyat kayması ve komisyon etkileri olabilir.
        </div>
        <div>
          Toplam tahmini maliyet: {fmtCurrency(rows.reduce((s, r) => s + safeNum(r.buyCost), 0), currency)}
          {typeof cashAvailable === "number" && (
            <>
              {" "}· Elde nakit: {fmtCurrency(cashAvailable, currency)} · Kalan: {fmtCurrency(cashAvailable - rows.reduce((s, r) => s + safeNum(r.buyCost), 0), currency)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
