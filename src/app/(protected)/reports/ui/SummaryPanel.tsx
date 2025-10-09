

"use client";
import { useState } from "react";

export type SummaryTotals = { income?: number; expense?: number; net?: number };
export type SummaryPoint = { month: string; income?: number; expense?: number; net?: number };
export type SummaryKV = { name: string; expense: number };

export default function SummaryPanel({
  currency = "TRY",
  month,
  totals,
  categories = [],
  merchants = [],
  sixMonth = [],
}: {
  currency?: "TRY" | "USD" | "EUR";
  month: string; // YYYY-MM
  totals: SummaryTotals;
  categories?: SummaryKV[];
  merchants?: SummaryKV[];
  sixMonth?: SummaryPoint[];
}) {
  const [text, setText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency, month, totals, categories, merchants, sixMonth }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Özet üretilemedi");
      setText(String(data.summary || ""));
    } catch (e: any) {
      setError(e?.message || "Özet üretilemedi");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  }

  function download() {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ozet_${month}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-medium">AI Özet</div>
        <div className="flex items-center gap-2 text-xs">
          <button onClick={generate} disabled={loading} className="rounded border px-2 py-1 hover:bg-gray-50 disabled:opacity-50">
            {loading ? "Üretiliyor…" : "Özet Oluştur"}
          </button>
          <button onClick={copy} disabled={!text} className="rounded border px-2 py-1 hover:bg-gray-50 disabled:opacity-50">Kopyala</button>
          <button onClick={download} disabled={!text} className="rounded border px-2 py-1 hover:bg-gray-50 disabled:opacity-50">İndir</button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Özet burada görünecek…"
        rows={8}
        className="w-full resize-y rounded-md border p-2 text-sm"
      />
    </div>
  );
}