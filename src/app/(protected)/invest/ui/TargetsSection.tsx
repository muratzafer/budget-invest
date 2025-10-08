"use client";
import { useEffect, useState } from "react";
import TargetAllocationEditor, { TargetRow } from "./TargetAllocationEditor";

export type TargetsSectionProps = {
  initialTargets: TargetRow[];
  actualWeights: Record<string, number>;
};

export default function TargetsSection({ initialTargets, actualWeights }: TargetsSectionProps) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<TargetRow[]>(initialTargets);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSave(rows: TargetRow[]) {
    try {
      setSaving(true);
      setMsg(null);
      const res = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rows),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Kayıt başarısız");
      }
      // Kayıt başarılı — local state'i güncelle
      setTargets(rows);
      setOpen(false);
      setMsg({ type: "success", text: "Hedefler kaydedildi." });
    } catch (err: any) {
      setMsg({ type: "error", text: err?.message || "Hedefler kaydedilemedi." });
    } finally {
      setSaving(false);
    }
  }

  // Load saved targets on mount (if any)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/targets", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json().catch(() => []);
        if (!Array.isArray(data) || data.length === 0) return;
        const rows = data
          .map((r: any) => ({
            symbol: String(r?.symbol ?? "").toUpperCase().trim(),
            targetPct: Number(r?.targetPct),
          }))
          .filter((r: any) => r.symbol.length > 0 && Number.isFinite(r.targetPct));
        if (!cancelled && rows.length > 0) {
          setTargets(rows);
        }
      } catch (e: any) {
        if (!cancelled) setMsg({ type: "error", text: "Hedefler yüklenemedi." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3000);
    return () => clearTimeout(t);
  }, [msg]);

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-medium">Hedef Dağılım</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            onClick={() => setOpen(true)}
            disabled={saving}
          >
            {saving ? "Kaydediliyor..." : "Hedefleri Düzenle"}
          </button>
        </div>
      </div>
      {msg && (
        <div
          className={`mb-3 rounded-md px-3 py-2 text-sm ${
            msg.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-rose-50 text-rose-700 border border-rose-200"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Özet göstergesi */}
      <div className="text-sm text-gray-600">
        {targets.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {targets.map((t) => {
              const actual = Number(actualWeights[t.symbol] ?? 0);
              return (
                <div key={t.symbol} className="rounded-md border px-2 py-1">
                  <span className="font-mono">{t.symbol}</span>{" "}
                  <span className="text-gray-500">{actual.toFixed(2)}%</span>{" "}
                  <span className="text-gray-400">/</span>{" "}
                  <span className="font-medium">{t.targetPct.toFixed(2)}%</span>
                </div>
              );
            })}
          </div>
        ) : (
          <span>Henüz hedef tanımlı değil.</span>
        )}
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-3xl rounded-xl bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-medium">Hedef Dağılım Düzenle</div>
              <button className="text-gray-500 hover:text-gray-800" onClick={() => setOpen(false)}>✕</button>
            </div>
            <TargetAllocationEditor
              initial={targets}
              actualWeights={actualWeights}
              onSave={handleSave}
              onCancel={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}