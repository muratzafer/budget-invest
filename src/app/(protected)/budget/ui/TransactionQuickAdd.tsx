"use client";
import { useState, useEffect } from "react";

export default function TransactionQuickAdd({ defaultMonth }: { defaultMonth: string }) {
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState<"TRY" | "USD" | "EUR">("TRY");
  const [date, setDate] = useState(() => {
    const [y, m] = (defaultMonth || "").split("-").map(Number);
    const d = isFinite(y) && isFinite(m) ? new Date(y, (m || 1) - 1, 15) : new Date();
    return d.toISOString().slice(0, 10);
  });
  const [merchant, setMerchant] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<{ name: string; confidence: number } | null>(null);

  const [categoryId, setCategoryId] = useState<string>("");
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadCats() {
      setCatLoading(true);
      setCatError(null);
      try {
        const res = await fetch("/api/budget/categories", { cache: "no-store" });
        const data = await res.json();
        const list = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
        if (!cancelled) setCategories(list.map((c: any) => ({ id: String(c.id), name: String(c.name) })));
      } catch (e: any) {
        if (!cancelled) setCatError("Kategoriler yüklenemedi");
      } finally {
        if (!cancelled) setCatLoading(false);
      }
    }
    loadCats();
    return () => { cancelled = true; };
  }, []);

  async function submit() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/budget/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          amount: Number(amount),
          currency,
          occurredAt: `${date}T12:00:00.000Z`,
          merchant,
          description: desc,
          categoryId: categoryId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Kaydedilemedi");
      setMsg("Kaydedildi ✔");
      setAmount(0);
      setMerchant("");
      setDesc("");
    } catch (e: any) {
      setMsg(e?.message || "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="mb-2 font-medium">Hızlı İşlem Ekle</div>
      <div className="grid grid-cols-1 items-end gap-2 md:grid-cols-6">
        <label className="text-sm">
          Tür
          <select value={type} onChange={(e) => setType(e.target.value as any)} className="mt-1 w-full rounded border px-2 py-1">
            <option value="expense">Gider</option>
            <option value="income">Gelir</option>
          </select>
        </label>
        <label className="text-sm">
          Tutar
          <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="mt-1 w-full rounded border px-2 py-1" />
        </label>
        <label className="text-sm">
          Para Birimi
          <select value={currency} onChange={(e) => setCurrency(e.target.value as any)} className="mt-1 w-full rounded border px-2 py-1">
            <option value="TRY">TRY</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </label>
        <label className="text-sm">
          Tarih
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" />
        </label>
        <label className="text-sm">
          Merchant
          <input value={merchant} onChange={(e) => setMerchant(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" />
        </label>
        <label className="text-sm">
          Kategori
          <div className="mt-1 flex items-center gap-2">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded border px-2 py-1"
              disabled={catLoading}
            >
              <option value="">(seçiniz)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          {catError && <div className="mt-1 text-xs text-red-600">{catError}</div>}
        </label>
        <label className="text-sm md:col-span-2">
          Açıklama
          <input value={desc} onChange={(e) => setDesc(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" />
        </label>
        <div className="flex items-end md:col-span-2">
          <button
            type="button"
            className="mt-1 w-full rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            disabled={aiBusy}
            onClick={async () => {
              try {
                setAiBusy(true);
                setAiError(null);
                setAiSuggestion(null);
                const res = await fetch("/api/budget/ml-suggest", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ merchant, description: desc, amount: Number(amount || 0) || null }),
                });
                const data = await res.json();
                const item = Array.isArray(data?.items) ? data.items[0] : null;
                if (item?.categoryName) {
                  setAiSuggestion({ name: item.categoryName, confidence: Number(item.confidence || 0) });
                  // dropdown'u otomatik seç: önce id varsa, yoksa isimle eşleştir
                  if (item.categoryId) {
                    setCategoryId(String(item.categoryId));
                  } else {
                    const hit = categories.find((c) => c.name.toLowerCase() === String(item.categoryName).toLowerCase());
                    if (hit) setCategoryId(hit.id);
                  }
                } else {
                  setAiError("Uygun bir kategori bulunamadı");
                }
              } catch (e) {
                setAiError("Tahmin sırasında bir hata oluştu");
              } finally {
                setAiBusy(false);
              }
            }}
          >
            {aiBusy ? "Kategori tahmin ediliyor…" : "Kategori tahmin et (AI)"}
          </button>
        </div>
        <div className="md:col-span-2">
          <button onClick={submit} disabled={saving} className="mt-1 w-full rounded border px-3 py-2 hover:bg-gray-50 disabled:opacity-50">
            {saving ? "Kaydediliyor…" : "Ekle"}
          </button>
          {msg && <div className="mt-1 text-xs text-gray-600">{msg}</div>}
        </div>
        {aiError && (
          <div className="md:col-span-2 mt-1 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{aiError}</div>
        )}
        {aiSuggestion && (
          <div className="md:col-span-2 mt-1 rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">
            Önerilen kategori: <span className="font-medium">{aiSuggestion.name}</span>
            {typeof aiSuggestion.confidence === "number" && (
              <> (güven: {(aiSuggestion.confidence * 100).toFixed(0)}%)</>
            )}
          </div>
        )}
      </div>
    </div>
  );
}