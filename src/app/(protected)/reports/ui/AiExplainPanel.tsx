

"use client";
import { useState } from "react";

export type ExplainTotals = { income?: number; expense?: number; net?: number };
export type ExplainPoint = { month: string; income?: number; expense?: number; net?: number };
export type ExplainKV = { name: string; expense: number };

export default function AiExplainPanel({
  currency = "TRY",
  month,
  totals,
  categories = [],
  merchants = [],
  sixMonth = [],
}: {
  currency?: "TRY" | "USD" | "EUR";
  month: string; // YYYY-MM
  totals: ExplainTotals;
  categories?: ExplainKV[];
  merchants?: ExplainKV[];
  sixMonth?: ExplainPoint[];
}) {
  const [question, setQuestion] = useState("Bu ay harcamalarım neden arttı?");
  const [tone, setTone] = useState<"neutral" | "friendly" | "direct">("neutral");
  const [language, setLanguage] = useState<"tr" | "en">("tr");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: question,
          context: { month, totals, topCategories: categories, topMerchants: merchants, sixMonth, currency },
          tone,
          language,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Açıklama üretilemedi");
      setAnswer(String(data.summary || ""));
    } catch (e: any) {
      setError(e?.message || "Açıklama üretilemedi");
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
    a.download = `aciklama_${month}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-medium">AI Açıklama</div>
        <div className="flex items-center gap-2 text-xs">
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
          <button onClick={run} disabled={loading} className="rounded border px-2 py-1 hover:bg-gray-50 disabled:opacity-50">
            {loading ? "Üretiliyor…" : "Açıkla"}
          </button>
          <button onClick={copy} disabled={!answer} className="rounded border px-2 py-1 hover:bg-gray-50 disabled:opacity-50">Kopyala</button>
          <button onClick={download} disabled={!answer} className="rounded border px-2 py-1 hover:bg-gray-50 disabled:opacity-50">İndir</button>
        </div>
      </div>

      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Sorunu yaz (örn. Bu ay neden negatif?)"
        rows={3}
        className="mb-2 w-full resize-y rounded-md border p-2 text-sm"
      />

      {error && (
        <div className="mb-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="AI açıklaması burada görünecek…"
        rows={8}
        className="w-full resize-y rounded-md border p-2 text-sm"
      />
    </div>
  );
}