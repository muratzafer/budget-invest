"use client";

import React, { useMemo, useEffect, useState } from "react";
import HoldingActions, { HoldingForActions } from "./HoldingActions";

type Props = {
  holdings: HoldingForActions[];
  onChanged?: () => void;
};

type LiveMap = Record<string, { price: number; asOf: number }>;

function fmt(n?: number | null, opts: Intl.NumberFormatOptions = { maximumFractionDigits: 2 }) {
  if (n === undefined || n === null || Number.isNaN(n)) return "-";
  return new Intl.NumberFormat("tr-TR", opts).format(Number(n));
}

export default function HoldingsTable({ holdings, onChanged }: Props) {
  const [livePrices, setLivePrices] = useState<LiveMap>({});

  useEffect(() => {
    function onLive(ev: Event) {
      const detail = (ev as CustomEvent).detail as LiveMap;
      setLivePrices((prev) => ({ ...prev, ...detail }));
    }
    window.addEventListener("live-prices", onLive as EventListener);
    return () => window.removeEventListener("live-prices", onLive as EventListener);
  }, []);

  if (!holdings || holdings.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500 dark:text-gray-400">
        Henüz herhangi bir yatırım eklenmemiş.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
      <table className="min-w-full text-sm text-left text-gray-700 dark:text-gray-200">
        <thead className="bg-gray-100 dark:bg-gray-800/50">
          <tr>
            <th className="px-4 py-2">Sembol</th>
            <th className="px-4 py-2 text-right">Miktar</th>
            <th className="px-4 py-2 text-right">Ort. Maliyet</th>
            <th className="px-4 py-2 text-right">Piyasa Fiyatı</th>
            <th className="px-4 py-2 text-right">Toplam Değer</th>
            <th className="px-4 py-2 text-right">K/Z</th>
            <th className="px-4 py-2 text-right">K/Z (%)</th>
            <th className="px-4 py-2 text-right">Hesap</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => {
            const quantity = Number(h.quantity ?? 0);
            const avgPrice = h.avgPrice !== undefined && h.avgPrice !== null ? Number(h.avgPrice) : undefined;

            // Yeni: canlı fiyat öncelikli
            const live = livePrices[h.symbol];
            const marketPrice =
              live?.price ??
              ((h as any).marketPrice !== undefined && (h as any).marketPrice !== null
                ? Number((h as any).marketPrice)
                : (h as any).lastPrice !== undefined && (h as any).lastPrice !== null
                ? Number((h as any).lastPrice)
                : undefined);

            const marketValue =
              marketPrice !== undefined ? quantity * marketPrice : (h as any).marketValue ?? undefined;

            const pnl =
              marketPrice !== undefined && avgPrice !== undefined
                ? (marketPrice - avgPrice) * quantity
                : (h as any).pnl ?? undefined;

            const pnlPct =
              marketPrice !== undefined && avgPrice !== undefined && avgPrice !== 0
                ? ((marketPrice - avgPrice) / avgPrice) * 100
                : (h as any).pnlPct ?? undefined;

            const pnlClass =
              (pnl ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";

            const pnlPctClass =
              (pnlPct ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";

            return (
              <tr key={h.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-4 py-2 font-medium">{h.symbol}</td>
                <td className="px-4 py-2 text-right">{fmt(quantity)}</td>
                <td className="px-4 py-2 text-right">
                  {avgPrice !== undefined ? `${fmt(avgPrice)} ${h.currency}` : "-"}
                </td>
                <td className="px-4 py-2 text-right">{fmt(marketPrice)}</td>
                <td className="px-4 py-2 text-right">{fmt(marketValue)}</td>
                <td className={`px-4 py-2 text-right ${pnlClass}`}>{fmt(pnl)}</td>
                <td className={`px-4 py-2 text-right ${pnlPctClass}`}>
                  {pnlPct !== undefined ? `${fmt(pnlPct, { maximumFractionDigits: 2 })}%` : "-"}
                </td>
                <td className="px-4 py-2 text-right">{h.account?.name ?? "-"}</td>
                <td className="px-4 py-2 text-right">
                  <HoldingActions holding={h} onChanged={onChanged} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
