"use client";

import { useEffect, useMemo, useState } from "react";


export type TxInput = {
    id: string;
    merchant: string | null;
    description: string | null;
    amount?: number | null;
    categoryId?: string | null;
};

type SuggestionRow = {
    id: string;
    merchant: string | null;
    description: string | null;
    amount?: number | null;
    suggestion?: {
      categoryId: string | null;
      categoryName: string | null;
      confidence: number;
      source: string;
      reason?: string;
    };
  };

  export default function CategorizeSuggestions({
    transactions,
    threshold = Number(process.env.NEXT_PUBLIC_ML_CONF_THRESHOLD ?? 0.35),
  }: {
    transactions: TxInput[];
    threshold?: number;
  }) {
    // Yalnız kategorisi boş olan son 20 işlem üzerinde çalışalım
    const pending = useMemo(
      () => transactions.filter((t) => !t.categoryId).slice(0, 20),
      [transactions]
    );
    const [busy, setBusy] = useState(false);
    const [rows, setRows] = useState<SuggestionRow[]>([]);
    const [applyLoading, setApplyLoading] = useState(false);
    const [saveRules, setSaveRules] = useState(true);

    useEffect(() => {
        setRows([]);
      }, [transactions]);

      async function fetchSuggestions() {
        if (!pending.length) return;
        setBusy(true);
        try {
          const res = await fetch("/api/budget/categorize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: pending.map((t) => t.id), threshold }),
          });
          const data = await res.json();
          if (data?.ok) {
            const map = new Map<string, any>((data.suggestions as any[]).map((s) => [s.id, s]));
            setRows(
              pending.map((t) => ({
                id: t.id,
                merchant: t.merchant,
                description: t.description,
                amount: t.amount,
                suggestion: map.get(t.id)
                  ? {
                      categoryId: map.get(t.id)!.categoryId,
                      categoryName: map.get(t.id)!.categoryName,
                      confidence: map.get(t.id)!.confidence,
                      source: map.get(t.id)!.source,
                      reason: map.get(t.id)!.reason,
                    }
                  : undefined,
              }))
            );
          }
        } finally {
          setBusy(false);
        }
        }

        async function applyAll() {
            if (!rows.length) return;
            setApplyLoading(true);
            try {
              const ids = rows
                .filter((r) => (r.suggestion?.categoryId ?? null) && (r.suggestion?.confidence ?? 0) >= threshold)
                .map((r) => r.id);
              if (!ids.length) return;
              const res = await fetch("/api/budget/categorize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids, apply: true, threshold, saveRules }),
              });
              const data = await res.json();
              if (data?.ok) {
                // basitçe sayfayı yenileyelim (server listesi tazelensin)
                location.reload();
              }
            } finally {
              setApplyLoading(false);
            }
        }

        async function applySingle(id: string) {
            const row = rows.find((r) => r.id === id);
            if (!row || !row.suggestion || !row.suggestion.categoryId) return;
            setApplyLoading(true);
            try {
              const res = await fetch("/api/budget/categorize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: [id], apply: true, threshold, saveRules }),
              });

              const data = await res.json();
              if (data?.ok) location.reload();
            } finally {
              setApplyLoading(false);
            }
            }

            return (
                <div className="rounded-2xl border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="font-medium">Kategori Önerileri</div>
                    <div className="text-xs text-gray-500">Kategorisi boş son {pending.length} işlem</div>
                  </div>
                  <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          disabled={busy || !pending.length}
          onClick={fetchSuggestions}
          className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {busy ? "Öneriler getiriliyor…" : "Önerileri Getir"}
        </button>
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={saveRules} onChange={(e) => setSaveRules(e.target.checked)} />
          Yüksek güvenlilerden kural oluştur
        </label>
        <button
          disabled={applyLoading || !rows.length}
          onClick={applyAll}
          className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {applyLoading ? "Uygulanıyor…" : `Eşik ≥ ${threshold} olanları uygula`}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2">İşlem</th>
              <th className="py-2">Açıklama</th>
              <th className="py-2 text-right">Tutar</th>
              <th className="py-2">Öneri</th>
              <th className="py-2 text-right">Güven</th>
              <th className="py-2">Kaynak</th>
              <th className="py-2 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="py-4 text-center text-gray-500" colSpan={7}>
                  {busy ? "Yükleniyor…" : "Henüz öneri yok"}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2 font-mono">{r.merchant || "—"}</td>
                  <td className="py-2 text-gray-600">{r.description || "—"}</td>
                  <td className="py-2 text-right">{typeof r.amount === "number" ? r.amount.toFixed(2) : "—"}</td>
                  <td className="py-2">{r.suggestion?.categoryName || "(yok)"}</td>
                  <td className="py-2 text-right">{r.suggestion ? `${(r.suggestion.confidence * 100).toFixed(0)}%` : "—"}</td>
                  <td className="py-2">{r.suggestion?.source || "—"}</td>
                  <td className="py-2 text-right">
                    <button
                      disabled={applyLoading || !r.suggestion?.categoryId}
                      onClick={() => applySingle(r.id)}
                      className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                    >
                      Uygula
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-xs text-gray-500">Not: AI önerileri hatalı olabilir; uygulamadan önce kontrol edin.</div>
    </div>
  );
}  