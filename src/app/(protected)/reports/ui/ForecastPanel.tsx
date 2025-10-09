"use client";
import { useMemo, useState, useCallback } from "react";

export type MonthlyPoint = {
  month: string; // YYYY-MM
  income: number;
  expense: number;
  net: number; // income - expense
};

export type ForecastPanelProps = {
  currency?: "TRY" | "USD" | "EUR";
  sixMonth: MonthlyPoint[]; // oldest → newest or any order (we'll sort)
  defaultHorizon?: 3 | 6;
};

type Method = "ma" | "linear"; // moving-average vs simple linear regression

type XY = { x: number; y: number };

function fmtCurrency(v: number, ccy: ForecastPanelProps["currency"]) {
  const val = Number(v ?? 0);
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: ccy ?? "TRY", maximumFractionDigits: 0 }).format(val);
  } catch {
    return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(val)} ${ccy ?? "TRY"}`;
  }
}

function toYearMonth(m: string) {
  // normalize to YYYY-MM
  if (/^\d{4}-\d{2}$/.test(m)) return m;
  const d = new Date(m);
  const y = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${mm}`;
}

function addMonthKey(key: string, add: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, (m - 1) + add, 1);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

export default function ForecastPanel({ currency = "TRY", sixMonth, defaultHorizon = 3 }: ForecastPanelProps) {
  const ordered = useMemo(() => {
    const arr = sixMonth.map((p) => ({ ...p, month: toYearMonth(p.month) }));
    arr.sort((a, b) => a.month.localeCompare(b.month));
    return arr;
  }, [sixMonth]);

  const [method, setMethod] = useState<Method>("ma");
  const [horizon, setHorizon] = useState<3 | 6>(defaultHorizon);

  // --- models ---
  const lastKey = ordered.length ? ordered[ordered.length - 1].month : toYearMonth(new Date().toISOString().slice(0, 7));
  const netSeries = ordered.map((p) => Number(p.net || 0));

  const maForecast = useCallback((n: number) => {
    // simple moving average with window = min(3, len)
    const window = Math.min(3, Math.max(1, netSeries.length));
    const avg = window > 0 ? netSeries.slice(-window).reduce((s, x) => s + x, 0) / window : 0;
    return new Array(n).fill(0).map(() => avg);
  }, [netSeries]);

  const linForecast = useCallback((n: number) => {
    // y = a + b*t ; t = 0..k-1
    const k = netSeries.length;
    if (k === 0) return new Array(n).fill(0);
    if (k === 1) return new Array(n).fill(netSeries[0]);
    const t = Array.from({ length: k }, (_, i) => i);
    const sumT = t.reduce((s, x) => s + x, 0);
    const sumY = netSeries.reduce((s, x) => s + x, 0);
    const sumTT = t.reduce((s, x) => s + x * x, 0);
    const sumTY = t.reduce((s, acc, i) => s + acc * netSeries[i], 0);
    const denom = k * sumTT - sumT * sumT || 1;
    const b = (k * sumTY - sumT * sumY) / denom;
    const a = (sumY - b * sumT) / k;
    const start = k; // continue the sequence
    return Array.from({ length: n }, (_, i) => a + b * (start + i));
  }, [netSeries]);

  const forecastValues = useMemo(() => {
    const n = horizon;
    const vals = method === "ma" ? maForecast(n) : linForecast(n);
    return vals.map((y, i) => ({ month: addMonthKey(lastKey, i + 1), net: y }));
  }, [horizon, method, lastKey, maForecast, linForecast]);

  const all = [...ordered, ...forecastValues];

  const chart = useMemo(() => {
    const values = all.map((p) => Number(p.net || 0));
    const min = Math.min(0, ...values);
    const max = Math.max(1, ...values);
    const width = Math.max(1, all.length - 1);

    // build points
    const pointsActual: XY[] = ordered.map((p, i) => ({ x: (i / width) * 100, y: max === min ? 50 : ((max - Number(p.net)) / (max - min)) * 100 }));
    const pointsForecast: XY[] = forecastValues.map((p, i) => {
      const idx = ordered.length + i;
      return { x: (idx / width) * 100, y: max === min ? 50 : ((max - Number(p.net)) / (max - min)) * 100 };
    });

    // x-axis ticks (about 6 labels)
    const step = Math.max(1, Math.floor(all.length / 6));
    const ticks = all.map((p, i) => ({
      i,
      x: (i / width) * 100,
      label: new Date(p.month + "-01").toLocaleDateString("tr-TR", { month: "2-digit" }),
    })).filter((_, i) => i % step === 0);

    return { min, max, pointsActual, pointsForecast, ticks };
  }, [all, ordered, forecastValues]);

  const totalForecast = useMemo(() => forecastValues.reduce((s, p) => s + Number(p.net || 0), 0), [forecastValues]);

  const exportCsv = useCallback(() => {
    const header = "Ay,Net\n";
    const rows = all.map((p) => `${p.month},${Math.round(Number(p.net || 0))}`).join("\n");
    const csv = header + rows;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `forecast_${horizon}ay_${method}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [all, horizon, method]);

  const height = 140;

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-medium">Tahmin (Net Akış)</div>
        <div className="flex items-center gap-2 text-xs">
          <label className="inline-flex items-center gap-1">
            Yöntem:
            <select value={method} onChange={(e) => setMethod(e.target.value as Method)} className="rounded border px-2 py-1">
              <option value="ma">Hareketli Ortalama</option>
              <option value="linear">Lineer Regresyon</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-1">
            Ufuk:
            <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value) as 3 | 6)} className="rounded border px-2 py-1">
              <option value={3}>3 ay</option>
              <option value={6}>6 ay</option>
            </select>
          </label>
          <div className="text-gray-600">Toplam Tahmin: {fmtCurrency(totalForecast, currency)}</div>
          <button type="button" onClick={exportCsv} className="rounded border px-2 py-1 hover:bg-gray-50">CSV</button>
        </div>
      </div>

      <div className="group relative">
        <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
          {/* orta çizgi */}
          <line x1="0" y1={height / 2} x2="100" y2={height / 2} stroke="#eee" strokeWidth="0.5" />
          {/* actual */}
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            points={chart.pointsActual.map((p) => `${p.x},${(p.y / 100) * height}`).join(" ")}
          />
          {/* forecast */}
          {chart.pointsForecast.length > 0 && (
            <polyline
              fill="none"
              stroke="#8884d8"
              strokeDasharray="2,2"
              strokeWidth="1"
              points={chart.pointsForecast.map((p) => `${p.x},${(p.y / 100) * height}`).join(" ")}
            />
          )}
        </svg>
        {/* x-axis */}
        <div className="mt-1 flex justify-between text-[10px] text-gray-500">
          {chart.ticks.map((t, i) => (
            <span key={i} style={{ transform: "translateX(-50%)" }} className="relative left-[50%]">{t.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}