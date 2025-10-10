

"use client";
import { useState } from "react";

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
        <label className="text-sm md:col-span-2">
          Açıklama
          <input value={desc} onChange={(e) => setDesc(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" />
        </label>
        <div className="md:col-span-2">
          <button onClick={submit} disabled={saving} className="mt-1 w-full rounded border px-3 py-2 hover:bg-gray-50 disabled:opacity-50">
            {saving ? "Kaydediliyor…" : "Ekle"}
          </button>
          {msg && <div className="mt-1 text-xs text-gray-600">{msg}</div>}
        </div>
      </div>
    </div>
  );
}