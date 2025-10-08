

"use client";
import { useEffect, useMemo, useState } from "react";

export type PortfolioTimeSeriesProps = {
  days?: number; // kaç günlük seri
  currency?: "TRY" | "USD" | "EUR";
  height?: number; // grafik yüksekliği (px)
};

type Point = {
  asOf: string;
  totalMarket: number;
  totalBook: number;
  pnl: number;
  diffPct: number;
};

function fmtCurrency(v: number, ccy: PortfolioTimeSeriesProps["currency"]) {
  const val = Number(v ?? 0);
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: ccy ?? "TRY", maximumFractionDigits: 0 }).format(val);
  } catch {
    return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(val)} ${ccy ?? "TRY"}`;
  }
}

export default function PortfolioTimeSeries({ days = 60, currency = "TRY", height = 160 }: PortfolioTimeSeriesProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [series, setSeries] = useState<Point[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/portfolio/series?days=${encodeURIComponent(days)}`, { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) {
          if (res.ok && Array.isArray(data?.series)) setSeries(data.series as Point[]);
          else setError(data?.error || "Seri yüklenemedi");
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Seri yüklenemedi");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [days]);

  const chart = useMemo(() => {
    if (!series.length) return { min: 0, max: 1, points: [] as { x: number; y: number }[], last: 0 };
    const vals = series.map((p) => Number(p.totalMarket));
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const width = Math.max(1, series.length - 1);
    const points = series.map((p, i) => ({ x: (i / width) * 100, y: max === min ? 50 : ((max - Number(p.totalMarket)) / (max - min)) * 100 }));
    return { min, max, points, last: vals[vals.length - 1] };
  }, [series]);

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-medium">Portföy Zaman Serisi</div>
        <div className="text-xs text-gray-500">Son Değer: {fmtCurrency(chart.last, currency)}</div>
      </div>

      {loading && <div className="text-sm text-gray-500">Yükleniyor…</div>}
      {error && (
        <div className="mb-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {!loading && !error && (
        <div className="w-full">
          {/* Basit SVG çizimi */}
          <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
            {/* arka plan grid (ince) */}
            <line x1="0" y1={height / 2} x2="100" y2={height / 2} stroke="#eee" strokeWidth="0.5" />
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              points={chart.points.map((p) => `${p.x},${(p.y / 100) * height}`).join(" ")}
            />
          </svg>
          <div className="mt-2 flex items-center justify-between text-[10px] text-gray-500">
            <span>Min: {fmtCurrency(chart.min, currency)}</span>
            <span>Max: {fmtCurrency(chart.max, currency)}</span>
          </div>
        </div>
      )}
    </div>
  );
}