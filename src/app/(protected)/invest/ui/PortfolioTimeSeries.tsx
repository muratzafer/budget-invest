"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

type Metric = "market" | "pnl";

type XY = { x: number; y: number };

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

  const [saving, setSaving] = useState(false);

  const [metric, setMetric] = useState<Metric>("market");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const [rangeDays, setRangeDays] = useState<number>(days);
  const [showPctLine, setShowPctLine] = useState<boolean>(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/portfolio/series?days=${encodeURIComponent(rangeDays)}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok && Array.isArray(data?.series)) setSeries(data.series as Point[]);
      else setError(data?.error || "Seri yüklenemedi");
    } catch (e: any) {
      setError(e?.message || "Seri yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [rangeDays]);

  const saveSnapshot = useCallback(async () => {
    try {
      setSaving(true);
      // Development ortamında header gerekmeyebilir; prod'da 401 dönerse kullanıcıya bilgi verelim.
      const res = await fetch("/api/cron/snapshot", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Snapshot kaydedilemedi (yetkisiz olabilir).");
      }
      // Başarılıysa seriyi yenile
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Snapshot kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }, [refresh]);

  useEffect(() => {
    let alive = true;
    (async () => {
      await refresh();
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  useEffect(() => {
    setRangeDays(days);
  }, [days]);

  const chart = useMemo(() => {
    if (!series.length) {
      return {
        min: 0,
        max: 1,
        points: [] as XY[],
        last: 0,
        ticks: [] as { x: number; label: string }[],
        pctMin: 0,
        pctMax: 0,
        pctPoints: [] as XY[],
      };
    }

    const primaryValues = series.map((p) => (metric === "market" ? Number(p.totalMarket) : Number(p.pnl)));
    const min = Math.min(...primaryValues);
    const max = Math.max(...primaryValues);
    const width = Math.max(1, series.length - 1);
    const points: XY[] = series.map((p, i) => ({
      x: (i / width) * 100,
      y: max === min ? 50 : ((max - primaryValues[i]) / (max - min)) * 100,
    }));

    // Secondary line: diffPct
    const pctValues = series.map((p) => Number(p.diffPct ?? 0));
    const pctMin = Math.min(...pctValues);
    const pctMax = Math.max(...pctValues);
    const pctPoints: XY[] = series.map((p, i) => ({
      x: (i / width) * 100,
      y: pctMax === pctMin ? 50 : ((pctMax - pctValues[i]) / (pctMax - pctMin)) * 100,
    }));

    const step = Math.max(1, Math.floor(series.length / 5));
    const ticks = series
      .map((p, i) => ({
        i,
        x: (i / width) * 100,
        label: new Date(p.asOf).toLocaleDateString("tr-TR", { month: "2-digit", day: "2-digit" }),
      }))
      .filter((_, i) => i % step === 0);

    return { min, max, points, last: primaryValues[primaryValues.length - 1], ticks, pctMin, pctMax, pctPoints };
  }, [series, metric]);

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="font-medium">Portföy Zaman Serisi</div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs">
            <label className="text-gray-600">Gün:</label>
            <select
              value={rangeDays}
              onChange={(e) => setRangeDays(Number(e.target.value))}
              className="rounded border px-2 py-1"
              title="Gösterilecek gün sayısı"
            >
              <option value={30}>30</option>
              <option value={60}>60</option>
              <option value={90}>90</option>
              <option value={180}>180</option>
            </select>
          </div>
          <label className="ml-1 inline-flex items-center gap-1 text-xs">
            <input type="checkbox" checked={showPctLine} onChange={(e) => setShowPctLine(e.target.checked)} />
            PnL %
          </label>
          <div className="mr-2 inline-flex overflow-hidden rounded border text-xs">
            <button
              type="button"
              onClick={() => setMetric("market")}
              className={`px-2 py-1 ${metric === "market" ? "bg-gray-900 text-white" : "bg-white text-gray-700"}`}
              title="Toplam piyasa değeri"
            >Piyasa</button>
            <button
              type="button"
              onClick={() => setMetric("pnl")}
              className={`px-2 py-1 border-l ${metric === "pnl" ? "bg-gray-900 text-white" : "bg-white text-gray-700"}`}
              title="Gerçekleşmemiş PnL"
            >PnL</button>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
            title="Verileri yenile"
          >
            {loading ? "Yükleniyor…" : "Yenile"}
          </button>
          <button
            type="button"
            onClick={saveSnapshot}
            disabled={saving}
            className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
            title="Yeni snapshot kaydet (dev)"
          >
            {saving ? "Kaydediliyor…" : "Snapshot al"}
          </button>
          <div className="text-xs text-gray-500">
            Son Değer: {metric === "market" ? fmtCurrency(chart.last, currency) : new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(chart.last)}
          </div>
        </div>
      </div>

      {loading && <div className="text-sm text-gray-500">Yükleniyor…</div>}
      {error && (
        <div className="mb-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {!loading && !error && (
        <div className="w-full">
          {series.length === 0 && (
            <div className="mb-2 text-xs text-gray-500">
              Henüz snapshot yok. “Snapshot al” butonunu kullanabilir veya cron’u Vercel’de zamanlayabilirsin.
            </div>
          )}
          {/* Basit SVG çizimi + hover */}
          <div
            className="group relative w-full"
            onMouseLeave={() => setHoverIdx(null)}
            onMouseMove={(e) => {
              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              const x = e.clientX - rect.left;
              const pct = Math.max(0, Math.min(1, x / rect.width));
              const idx = Math.round(pct * (series.length - 1));
              setHoverIdx(Number.isFinite(idx) ? idx : null);
            }}
          >
            <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
              {/* arka plan grid (ince) */}
              <line x1="0" y1={height / 2} x2="100" y2={height / 2} stroke="#eee" strokeWidth="0.5" />
              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                points={chart.points.map((p) => `${p.x},${(p.y / 100) * height}`).join(" ")}
              />

              {showPctLine && chart.pctPoints.length > 0 && (
                <polyline
                  fill="none"
                  stroke="#8884d8"
                  strokeDasharray="2,2"
                  strokeWidth="1"
                  points={chart.pctPoints.map((p) => `${p.x},${(p.y / 100) * height}`).join(" ")}
                />
              )}

              {hoverIdx !== null && series[hoverIdx] && (
                <>
                  {/* dikey çizgi */}
                  <line x1={(hoverIdx / Math.max(1, series.length - 1)) * 100} y1={0} x2={(hoverIdx / Math.max(1, series.length - 1)) * 100} y2={height} stroke="#ddd" strokeWidth="0.5" />
                  {/* nokta */}
                  {chart.points[hoverIdx] && (
                    <circle cx={chart.points[hoverIdx].x} cy={(chart.points[hoverIdx].y / 100) * height} r={1.5} />
                  )}
                </>
              )}
            </svg>

            {/* x-axis ticks */}
            <div className="mt-1 flex justify-between text-[10px] text-gray-500">
              {chart.ticks.map((t, i) => (
                <span key={i} style={{ transform: "translateX(-50%)" }} className="relative left-[50%]">
                  {t.label}
                </span>
              ))}
            </div>

            {/* tooltip */}
            {hoverIdx !== null && series[hoverIdx] && (
              <div className="pointer-events-none absolute -top-2 left-0 translate-y-[-100%] rounded-md border bg-white px-2 py-1 text-[10px] shadow-sm">
                <div className="font-medium">
                  {new Date(series[hoverIdx].asOf).toLocaleDateString("tr-TR", { year: "2-digit", month: "2-digit", day: "2-digit" })}
                </div>
                <div>
                  {metric === "market"
                    ? `Değer: ${fmtCurrency(Number(series[hoverIdx].totalMarket), currency)}`
                    : `PnL: ${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Number(series[hoverIdx].pnl))}`}
                </div>
                <div>
                  Değişim: {new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(Number(series[hoverIdx].diffPct ?? 0))}%
                </div>
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between text-[10px] text-gray-500">
            <span>
              Min: {metric === "market" ? fmtCurrency(chart.min, currency) : new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(chart.min)}
              {showPctLine && `  |  PnL% Min: ${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(chart.pctMin)}`}
            </span>
            <span>
              Max: {metric === "market" ? fmtCurrency(chart.max, currency) : new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(chart.max)}
              {showPctLine && `  |  PnL% Max: ${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(chart.pctMax)}`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}