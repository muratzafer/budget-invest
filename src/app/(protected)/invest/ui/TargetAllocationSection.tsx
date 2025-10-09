"use client";
// Implementation: TargetAllocationSection.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import TargetAllocationEditor, { TargetRow } from "./TargetAllocationEditor";
import RebalanceSuggestions from "./RebalanceSuggestions";

export default function TargetAllocationSection({ currency = "TRY", totalMarket, actualWeights }: { currency?: "TRY"|"USD"|"EUR"; totalMarket: number; actualWeights: Record<string, number>; }) {
  const [rows, setRows] = useState<TargetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/targets", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Hedefler yüklenemedi");
      setRows(Array.isArray(data) ? data : []);
    } catch (e:any) {
      setError(e?.message || "Hedefler yüklenemedi");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = useMemo(() => rows.reduce((a, r) => a + Number(r.targetPct || 0), 0), [rows]);

  async function handleSave(next: TargetRow[]) {
    const res = await fetch("/api/targets", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(next)});
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || "Kayıt başarısız");
      return;
    }
    await load();
  }

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-medium">Hedef Dağılım</div>
        <div className="text-xs text-gray-500">Toplam: {total.toFixed(2)}%</div>
      </div>
      {error && <div className="mb-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500">Yükleniyor…</div>
      ) : (
        <>
          <TargetAllocationEditor initial={rows} onSave={handleSave} onCancel={load} />
          <div className="mt-4">
            <RebalanceSuggestions currency={currency} totalMarket={totalMarket} actualWeights={actualWeights} targets={rows} />
          </div>
        </>
      )}
    </div>
  );
}
