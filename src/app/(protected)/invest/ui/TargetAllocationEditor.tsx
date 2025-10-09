"use client";
/**
 * TargetAllocationEditor.tsx
 * Hedef portföy dağılımını düzenleme bileşeni.
 * - Sembol ve yüzde satırları (ekle/sil/düzenle)
 * - Toplam 100% doğrulaması
 * - Gerçekleşen ağırlıklarla karşılaştırma (opsiyonel)
 * - Kaydet/İptal event'leri
 *
 * Sadece UI/Frontend. Veriyi DB'ye kaydetmek üst bileşenin sorumluluğunda.
 */

import { useEffect, useMemo, useState } from "react";

export type TargetRow = { symbol: string; targetPct: number };

export type TargetAllocationEditorProps = {
  initial?: TargetRow[];                      // başlangıç hedefleri
  actualWeights?: Record<string, number>;     // gerçekleşen yüzdeler (opsiyonel)
  onSave?: (rows: TargetRow[]) => void;       // Kaydet'e basınca çağrılır
  onCancel?: () => void;                      // İptal'e basınca çağrılır
};

const isFiniteNumber = (v: any) => Number.isFinite(Number(v));

export default function TargetAllocationEditor({
  initial = [],
  actualWeights = {},
  onSave,
  onCancel,
}: TargetAllocationEditorProps) {
  const [rows, setRows] = useState<TargetRow[]>(() =>
    initial.length > 0 ? dedupe(normalize(initial)) : [{ symbol: "", targetPct: 0 }]
  );

  // initial değişirse rows'u güncelle
  useEffect(() => {
    if (initial && initial.length > 0) {
      setRows(dedupe(normalize(initial)));
    }
  }, [initial]);

  const totalPct = useMemo(
    () => rows.reduce((acc, r) => acc + (Number(r.targetPct) || 0), 0),
    [rows]
  );

  const diffFrom100 = useMemo(() => 100 - totalPct, [totalPct]);
  const isTotalOk = Math.abs(diffFrom100) < 1e-6 || Number(diffFrom100.toFixed(2)) === 0;

  function setRow(i: number, patch: Partial<TargetRow>) {
    setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows(prev => [...prev, { symbol: "", targetPct: 0 }]);
  }

  function removeRow(i: number) {
    setRows(prev => prev.filter((_, idx) => idx !== i));
  }

  async function saveRow(i: number) {
    const r = rows[i];
    if (!r) return;
    const symbol = (r.symbol || "").trim().toUpperCase();
    const targetPct = Number(r.targetPct);
    if (!symbol) return alert("Sembol boş olamaz");
    if (!Number.isFinite(targetPct)) return alert("Geçersiz yüzde");
    try {
      const res = await fetch("/api/targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, targetPct }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Satır kaydedilemedi");
      // normalize saved row
      setRow(i, { symbol, targetPct: Number(Number(targetPct).toFixed(4)) });
    } catch (e: any) {
      alert(e?.message || "Satır kaydedilemedi");
    }
  }

  async function deleteRowApi(i: number) {
    const r = rows[i];
    if (!r) return;
    const symbol = (r.symbol || "").trim().toUpperCase();
    if (!symbol) return;
    if (!confirm(`${symbol} hedefini silmek istiyor musun?`)) return;
    try {
      const res = await fetch(`/api/targets?symbol=${encodeURIComponent(symbol)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Satır silinemedi");
      removeRow(i);
    } catch (e: any) {
      alert(e?.message || "Satır silinemedi");
    }
  }

  function autoNormalize() {
    const filtered = rows.filter(r => r.symbol.trim() !== "");
    if (filtered.length === 0) return;
    const equal = Number((100 / filtered.length).toFixed(4));
    const next = filtered.map((r, idx) => ({
      ...r,
      targetPct: idx === filtered.length - 1 ? 100 - equal * (filtered.length - 1) : equal,
    }));
    setRows(next);
  }

  function sortByPct(desc = true) {
    setRows(prev => [...prev].sort((a, b) => (desc ? b.targetPct - a.targetPct : a.targetPct - b.targetPct)));
  }

  function sortBySymbol() {
    setRows(prev => [...prev].sort((a, b) => a.symbol.localeCompare(b.symbol)));
  }

  function handleSave() {
    const cleaned = dedupe(
      normalize(rows.filter(r => r.symbol.trim() !== "" && isFiniteNumber(r.targetPct)))
    );
    if (cleaned.length === 0) return;
    // otomatik düzeltme: toplam 100 değilse, oransal normalize et
    const sum = cleaned.reduce((acc, r) => acc + Number(r.targetPct), 0);
    const fixed =
      sum !== 100 && sum > 0
        ? cleaned.map(r => ({ ...r, targetPct: (Number(r.targetPct) / sum) * 100 }))
        : cleaned;
    onSave?.(fixed.map(r => ({ ...r, targetPct: Number(Number(r.targetPct).toFixed(4)) })));
  }

  const Errors = () => {
    const hasEmpty = rows.some(r => r.symbol.trim() === "");
    const hasNaN = rows.some(r => !isFiniteNumber(r.targetPct));
    const messages: string[] = [];
    if (hasEmpty) messages.push("Boş sembol alanları var.");
    if (hasNaN) messages.push("Geçersiz yüzde değeri var.");
    if (!isTotalOk) messages.push(`Toplam ${totalPct.toFixed(2)}%. (Fark: ${diffFrom100.toFixed(2)}%)`);
    if (messages.length === 0) return null;
    return (
      <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        {messages.map((m, i) => (
          <div key={i}>• {m}</div>
        ))}
      </div>
    );
  };

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="font-medium">Hedef Dağılım Düzenleyici</div>
        <div className="text-sm text-gray-600">
          Toplam:{" "}
          <span className={`${isTotalOk ? "text-emerald-600" : "text-rose-600"} font-medium`}>
            {totalPct.toFixed(2)}%
          </span>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
          onClick={addRow}
        >
          + Satır Ekle
        </button>
        <button
          type="button"
          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
          onClick={autoNormalize}
        >
          Eşit Dağıt (100%)
        </button>
        <button
          type="button"
          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
          onClick={() => sortByPct(true)}
        >
          %'ye Göre Sırala (↓)
        </button>
        <button
          type="button"
          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
          onClick={sortBySymbol}
        >
          Sembole Göre Sırala (A→Z)
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2">Sembol</th>
              <th className="py-2 text-right">Hedef %</th>
              <th className="py-2">Gerçekleşen %</th>
              <th className="py-2 text-right">Aksiyon</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const actual = Number(actualWeights[r.symbol] ?? 0);
              const delta = Number((Number(r.targetPct || 0) - actual).toFixed(2));
              const deltaClass = delta === 0 ? "text-gray-500" : delta > 0 ? "text-emerald-700" : "text-rose-700";
              const barWidth = Math.max(0, Math.min(100, actual));
              return (
                <tr key={i} className="border-b last:border-0 align-middle">
                  <td className="py-2 pr-2">
                    <input
                      className="w-full rounded-md border px-3 py-2 font-mono"
                      placeholder="BTCUSDT"
                      value={r.symbol}
                      onChange={(e) => setRow(i, { symbol: e.target.value.toUpperCase() })}
                    />
                  </td>
                  <td className="py-2 pl-2 text-right">
                    <input
                      className="w-28 rounded-md border px-3 py-2 text-right"
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      value={r.targetPct}
                      onChange={(e) => setRow(i, { targetPct: Number(e.target.value) })}
                    />
                  </td>
                  <td className="py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="h-2 w-full rounded bg-gray-100 overflow-hidden">
                        <div className="h-2 rounded" style={{ width: `${barWidth}%` }} />
                      </div>
                      <div className="w-24 text-right tabular-nums text-gray-600">
                        {isFiniteNumber(actual) ? `${actual.toFixed(2)}%` : "—"}
                      </div>
                      <div className={`w-20 text-right tabular-nums ${deltaClass}`}>
                        {isFiniteNumber(actual) ? (delta > 0 ? `+${delta}%` : `${delta}%`) : ""}
                      </div>
                    </div>
                  </td>
                  <td className="py-2 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => saveRow(i)}
                        className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
                        title="Bu satırı kaydet (PUT)"
                      >Kaydet</button>
                      <button
                        type="button"
                        onClick={() => deleteRowApi(i)}
                        className="rounded-md border px-2 py-1 text-xs hover:bg-rose-50 text-rose-700"
                        title="Bu satırı sil (DELETE)"
                      >Sil</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-gray-500">Satır yok.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Errors />

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
        >
          İptal
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
          disabled={rows.length === 0}
        >
          Kaydet
        </button>
      </div>
    </div>
  );
}

/* ---------- Helpers ---------- */
function normalize(items: TargetRow[]): TargetRow[] {
  return items
    .map(r => ({ symbol: (r.symbol || "").toUpperCase().trim(), targetPct: clamp(Number(r.targetPct) || 0, 0, 100) }))
    .filter(r => r.symbol !== "");
}
function dedupe(items: TargetRow[]): TargetRow[] {
  const map = new Map<string, number>();
  for (const r of items) {
    map.set(r.symbol, (map.get(r.symbol) ?? 0) + Number(r.targetPct));
  }
  return Array.from(map.entries()).map(([symbol, targetPct]) => ({ symbol, targetPct }));
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}