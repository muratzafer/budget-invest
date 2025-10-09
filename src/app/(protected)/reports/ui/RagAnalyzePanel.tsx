

"use client";
import { useMemo, useState } from "react";

export default function RagAnalyzePanel({
  month,
  defaultLimit = 10,
  defaultLanguage = "tr",
  defaultTone = "neutral",
}: {
  month: string; // YYYY-MM
  defaultLimit?: number;
  defaultLanguage?: "tr" | "en";
  defaultTone?: "neutral" | "friendly" | "direct";
}) {
  const [question, setQuestion] = useState("Bu dönemi özetle ve önemli noktaları açıkla.");
  const [language, setLanguage] = useState<"tr" | "en">(defaultLanguage);
  const [tone, setTone] = useState<"neutral" | "friendly" | "direct">(defaultTone);
  const [limit, setLimit] = useState(defaultLimit);
  const [from, setFrom] = useState(() => `${month}-01`);
  const [to, setTo] = useState(() => {
    const [y, m] = month.split("-").map(Number);
    const end = new Date(y, (m || 1), 0);
    return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  });
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ tx?: number; topCat?: number; topMer?: number } | null>(null);

  const valid = useMemo(() => Boolean(from && to && limit >= 1 && limit <= 50), [from, to, limit]);

  async function run() {
    if (!valid) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/rag-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, limit, question, language, tone }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Analiz başarısız");
      setAnswer(String(data.summary || ""));
      const ctx = data.context || {};
      setMeta({ tx: ctx?.totals?.count, topCat: ctx?.topCategories?.length, topMer: ctx?.topMerchants?.length });
    } catch (e: any) {
      setError(e?.message || "Analiz başarısız");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(answer); } catch {}
  }
  function download() {
    const blob = new Blob([answer], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rag_analiz_${from}_${to}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-2xl border p-4 shadow-sm bg-white dark:bg-zinc-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">RAG Analiz</div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="inline-flex items-center gap-1">
            Dil:
            <select value={language} onChange={(e) => setLanguage(e.target.value as any)} className="rounded border px-2 py-1">
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-1">
            Ton:
            <select value={tone} onChange={(e) => setTone(e.target.value as any)} className="rounded border px-2 py-1">
              <option value="neutral">Nötr</option>
              <option value="friendly">Samimi</option>
              <option value="direct">Doğrudan</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-1">
            Limit:
            <input type="number" min={3} max={50} value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="w-16 rounded border px-2 py-1" />
          </label>
          <label className="inline-flex items-center gap-1">
            Başlangıç:
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border px-2 py-1" />
          </label>
          <label className="inline-flex items-center gap-1">
            Bitiş:
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border px-2 py-1" />
          </label>
          <button onClick={run} disabled={loading || !valid} className="rounded border px-2 py-1 hover:bg-gray-50 disabled:opacity-50">
            {loading ? "Analiz yapılıyor…" : "Analiz Et"}
          </button>
          <button onClick={copy} disabled={!answer} className="rounded border px-2 py-1 hover:bg-gray-50 disabled:opacity-50">Kopyala</button>
          <button onClick={download} disabled={!answer} className="rounded border px-2 py-1 hover:bg-gray-50 disabled:opacity-50">İndir</button>
        </div>
      </div>

      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Sorunu yaz (örn. Son 90 günde dikkat çeken nedir?)"
        rows={3}
        className="mb-2 w-full resize-y rounded-md border p-2 text-sm"
      />

      {error && (
        <div className="mb-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {!!answer && meta && (
        <div className="mb-2 text-xs text-gray-500">
          Bağlam: {meta.tx ?? 0} işlem, {meta.topCat ?? 0} kategori, {meta.topMer ?? 0} merchant
        </div>
      )}

      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="AI özeti burada görünecek…"
        rows={8}
        className="w-full resize-y rounded-md border p-2 text-sm"
      />
    </section>
  );
}