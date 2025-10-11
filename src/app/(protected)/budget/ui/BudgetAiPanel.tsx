

"use client";
import { useMemo, useState } from "react";

type Tone = "neutral" | "friendly" | "direct";

export default function BudgetAiPanel({
  defaultMonth,
}: {
  defaultMonth?: string; // YYYY-MM
}) {
  // Varsayılan olarak bu ay
  const today = useMemo(() => new Date(), []);
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");

  const [month, setMonth] = useState<string>(defaultMonth || `${yyyy}-${mm}`);
  const [question, setQuestion] = useState<string>(
    "Bu dönemin gelir-gider performansını özetle; dikkat çeken artış/azalış, kategori ve merchant bazlı kısa analiz yap."
  );
  const [tone, setTone] = useState<Tone>("neutral");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string>("");

  async function runAnalyze() {
    setLoading(true);
    setError(null);
    setSummary("");
    try {
      const res = await fetch("/api/budget/rag-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, question, tone }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "İstek başarısız");
      setSummary(String(data.summary || ""));
    } catch (e: any) {
      setError(e?.message || "İstek başarısız");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-medium">Budget AI Analiz</div>
        <div className="text-xs text-gray-500">RAG + OpenAI ile özet</div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <label className="text-sm">
          Ay (YYYY-MM)
          <input
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            placeholder="2025-10"
            className="mt-1 w-full rounded border px-2 py-1 font-mono"
          />
        </label>
        <label className="text-sm">
          Üslup
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as Tone)}
            className="mt-1 w-full rounded border px-2 py-1"
          >
            <option value="neutral">Nötr</option>
            <option value="friendly">Samimi</option>
            <option value="direct">Doğrudan</option>
          </select>
        </label>
        <div className="md:col-span-2 flex items-end">
          <button
            onClick={runAnalyze}
            disabled={loading}
            className="w-full rounded border px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? "Analiz ediliyor…" : "Analizi Çalıştır"}
          </button>
        </div>
      </div>

      <label className="mt-3 block text-sm">
        Soru / İstek
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded border px-2 py-1"
          placeholder="Örn: Bu ay market harcamaları niçin arttı? Kategori ve merchant bazında açıkla."
        />
      </label>

      {error && (
        <div className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</div>
      )}

      {summary && (
        <div className="mt-3 whitespace-pre-wrap rounded-2xl border p-3 text-sm leading-6">
          {summary}
        </div>
      )}
    </div>
  );
}