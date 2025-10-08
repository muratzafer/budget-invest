"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  totalPositions: number;
  totalQty: number;
  totalBook: number;
  totalMarket: number;
  totalPnl: number;
  baseCurrency?: string; // e.g. "TRY"
  diffPct?: number; // optional, calculated if not provided
};

function fmt(n: number, currency = "TRY") {
  const v = Number(n ?? 0);
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(v)} ${currency}`;
  }
}

function fmtPct(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return `${new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 2,
  }).format(v)}%`;
}

/**
 * Tiny hook to highlight a value when it changes.
 * Returns a boolean `flash` you can use to toggle CSS classes.
 */
function useFlashOnChange(value: number | string, durationMs = 900) {
  const prev = useRef<typeof value>(value);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (prev.current !== value) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), durationMs);
      prev.current = value;
      return () => clearTimeout(t);
    }
  }, [value, durationMs]);

  return flash;
}

export default function PortfolioOverview({
  totalPositions,
  totalQty,
  totalBook,
  totalMarket,
  totalPnl,
  baseCurrency = "TRY",
}: Props) {
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [sources, setSources] = useState<string[]>([]);

  // Listen to live price events to show last update & data sources
  useEffect(() => {
    function handleLivePrices(ev: any) {
      const arr = Array.isArray(ev?.detail) ? ev.detail : [];
      const times = arr
        .map((x: any) => (x?.asOf ? new Date(x.asOf).getTime() : 0))
        .filter((t: number) => Number.isFinite(t) && t > 0);
      if (times.length > 0) {
        const maxT = Math.max(...times);
        setLastUpdate(new Date(maxT).toLocaleString("tr-TR"));
      }
      const set = new Set<string>();
      for (const x of arr) {
        const src = String(x?.source || "").toLowerCase();
        if (src) set.add(src === "binance" ? "Binance" : "Yahoo");
      }
      if (set.size > 0) setSources(Array.from(set));
    }
    window.addEventListener("live-prices", handleLivePrices as any);
    return () => window.removeEventListener("live-prices", handleLivePrices as any);
  }, []);

  const pnlPct = totalBook ? (totalPnl / totalBook) * 100 : 0;
  const flashQty = useFlashOnChange(totalQty);
  const flashBook = useFlashOnChange(totalBook);
  const flashMkt  = useFlashOnChange(totalMarket);
  const flashPnl  = useFlashOnChange(totalPnl);
  return (
    <>
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <div>{lastUpdate ? `Son güncelleme: ${lastUpdate}` : "Son güncelleme: —"}</div>
        <div>{sources.length > 0 ? `Kaynak: ${sources.join(" + ")}` : "Kaynak: —"}</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <div className="rounded-2xl border p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">Toplam Pozisyon</div>
          <div className="text-2xl font-semibold">{totalPositions}</div>
        </div>
        <div className="rounded-2xl border p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">Toplam Adet</div>
          <div
            className={`text-2xl font-semibold transition-colors ${
              flashQty ? "bg-amber-100/40 dark:bg-amber-900/20 rounded px-1" : ""
            }`}
            aria-live="polite"
          >
            {new Intl.NumberFormat("tr-TR").format(totalQty)}
          </div>
        </div>
        <div className="rounded-2xl border p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">Maliyet (Defter)</div>
          <div
            className={`text-2xl font-semibold transition-colors ${
              flashBook ? "bg-amber-100/40 dark:bg-amber-900/20 rounded px-1" : ""
            }`}
            aria-live="polite"
          >
            {fmt(totalBook, baseCurrency)}
          </div>
        </div>
        <div className="rounded-2xl border p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">Güncel Değer</div>
          <div
            className={`text-2xl font-semibold transition-colors ${
              flashMkt ? "bg-emerald-100/40 dark:bg-emerald-900/20 rounded px-1" : ""
            }`}
            aria-live="polite"
          >
            {fmt(totalMarket, baseCurrency)}
          </div>
        </div>
        <div className="rounded-2xl border p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">Toplam P&L</div>
          <div className="flex items-baseline gap-2">
            <div
              className={`text-2xl font-semibold ${totalPnl >= 0 ? "text-emerald-600" : "text-rose-600"} transition-colors ${
                flashPnl ? (totalPnl >= 0 ? "bg-emerald-100/40 dark:bg-emerald-900/20" : "bg-rose-100/40 dark:bg-rose-900/20") : ""
              } rounded px-1`}
              aria-label="Toplam kar/zarar"
              aria-live="polite"
              title={`Toplam P&L: ${fmt(totalPnl, baseCurrency)}`}
            >
              {fmt(totalPnl, baseCurrency)}
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium border ${
                totalPnl >= 0
                  ? "text-emerald-700 border-emerald-200 bg-emerald-50"
                  : "text-rose-700 border-rose-200 bg-rose-50"
              }`}
              aria-label="P&L yüzde"
              title={`Oransal değişim: ${fmtPct(pnlPct)}`}
            >
              {totalPnl >= 0 ? "▲" : "▼"} {fmtPct(pnlPct)}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
