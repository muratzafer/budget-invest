"use client";

import { useEffect, useMemo, useState } from "react";

type Account = { id: string; name: string; currency: string; type: string };
type Category = { id: string; name: string; type: "income" | "expense" };
type Tx = {
  id: string;
  accountId: string;
  categoryId: string | null;
  type: "income" | "expense" | "transfer";
  amount: number;
  currency: string;
  description: string | null;
  merchant: string | null;
  occurredAt: string; // API'den ISO string gelir
  account?: Account;
  category?: Category | null;
  categorySource?: "user" | "rule" | "ml";
  suggestedCategoryId?: string | null;
  suggestedConfidence?: number | null;
};

export default function TransactionPanel({
  accounts,
  categories,
  initialTx,
}: {
  accounts: Account[];
  categories: Category[];
  initialTx: Tx[];
}) {
  const [items, setItems] = useState<Tx[]>(() => structuredClone(initialTx));
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<"income" | "expense" | "transfer">("expense");

  // form state
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(accounts[0]?.currency ?? "TRY");
  const [occurredAt, setOccurredAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [merchant, setMerchant] = useState("");

  const filteredCategories = useMemo(
    () => categories.filter((c) => (type === "income" ? c.type === "income" : c.type !== "income")),
    [categories, type]
  );

  useEffect(() => {
    // type değiştiğinde kategori seçimini sıfırla
    setCategoryId(null);
  }, [type]);

  async function createTx() {
    setLoading(true);
    try {
      const payload = {
        accountId,
        categoryId: categoryId ?? null,
        type,
        amount: Number(amount),
        currency,
        description: description || null,
        merchant: merchant || null,
        occurredAt, // YYYY-MM-DD -> server zod coerce.date() ile Date'e çeviriyor
      };

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ? JSON.stringify(j.error) : "İşlem eklenemedi");
      }
      const created: Tx = await res.json();
      setItems((s) => [created, ...s]);
      // form reset
      setAmount("");
      setDescription("");
      setMerchant("");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function removeTx(id: string) {
    const prev = items;
    setItems((s) => s.filter((x) => x.id !== id));
    const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setItems(prev);
      alert("Silme işlemi başarısız.");
    }
  }

  async function confirmTx(id: string) {
    const res = await fetch(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm" }),
    });
    if (res.ok) {
      const updated: Tx = await res.json();
      setItems((s) => s.map((x) => (x.id === id ? { ...x, ...updated } : x)));
    } else {
      alert("Onaylama başarısız.");
    }
  }

  async function recategorizeTx(id: string, newCategoryId: string) {
    const res = await fetch(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "recategorize", categoryId: newCategoryId }),
    });
    if (res.ok) {
      const updated: Tx = await res.json();
      setItems((s) => s.map((x) => (x.id === id ? { ...x, ...updated } : x)));
    } else {
      alert("Kategori değiştirme başarısız.");
    }
  }

  return (
    <div className="space-y-6">
      {/* FORM */}
      <div className="grid md:grid-cols-6 gap-3 items-end">
        <div className="flex flex-col">
          <label className="text-sm">Tür</label>
          <select value={type} onChange={(e) => setType(e.target.value as any)} className="border rounded px-3 py-2">
            <option value="expense">expense</option>
            <option value="income">income</option>
            <option value="transfer">transfer</option>
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-sm">Hesap</label>
          <select
            value={accountId}
            onChange={(e) => {
              const id = e.target.value;
              setAccountId(id);
              const acc = accounts.find((a) => a.id === id);
              if (acc) setCurrency(acc.currency);
            }}
            className="border rounded px-3 py-2"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-sm">Kategori</label>
          <select
            value={categoryId ?? ""}
            onChange={(e) => setCategoryId(e.target.value || null)}
            className="border rounded px-3 py-2"
          >
            <option value="">(yok)</option>
            {filteredCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-sm">Tutar</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            step="0.01"
            className="border rounded px-3 py-2"
            placeholder="0.00"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-sm">Para Birimi</label>
          <input value={currency} onChange={(e) => setCurrency(e.target.value)} className="border rounded px-3 py-2" />
        </div>

        <div className="flex flex-col">
          <label className="text-sm">Tarih</label>
          <input
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            type="date"
            className="border rounded px-3 py-2"
          />
        </div>

        <div className="md:col-span-6 grid md:grid-cols-3 gap-3">
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="İşyeri (opsiyonel)"
            className="border rounded px-3 py-2"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Açıklama (opsiyonel)"
            className="border rounded px-3 py-2"
          />
          <button
            onClick={createTx}
            disabled={loading || !accountId || !amount}
            className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          >
            {loading ? "Ekleniyor..." : "İşlem Ekle"}
          </button>
        </div>
      </div>

      {/* TABLO */}
      <div className="overflow-x-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left p-2">Tarih</th>
              <th className="text-left p-2">Tür</th>
              <th className="text-left p-2">Hesap</th>
              <th className="text-left p-2">Kategori</th>
              <th className="text-right p-2">Tutar</th>
              <th className="text-left p-2">Para</th>
              <th className="text-left p-2">Açıklama</th>
              <th className="text-left p-2">İşyeri</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="p-2" suppressHydrationWarning>{t.occurredAt}</td>
                <td className="p-2">{t.type}</td>
                <td className="p-2">{t.account?.name ?? "—"}</td>
                <td className="p-2">
                  {t.category?.name ?? "—"}{" "}
                  {t.categorySource === "ml" && (
                    <span className="ml-2 inline-flex items-center text-xs rounded bg-yellow-100 px-1.5 py-0.5">
                      ⚡︎ ML
                    </span>
                  )}
                  {t.categorySource === "rule" && (
                    <span className="ml-2 inline-flex items-center text-xs rounded bg-gray-200 px-1.5 py-0.5">
                      ⚙︎ Rule
                    </span>
                  )}
                  {t.categorySource === "ml" && (
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        className="text-green-700 underline"
                        onClick={() => confirmTx(t.id)}
                      >
                        Onayla
                      </button>
                      <select
                        className="border rounded px-1 py-0.5"
                        defaultValue={t.categoryId ?? ""}
                        onChange={(e) => {
                          const newCat = e.target.value;
                          if (newCat) recategorizeTx(t.id, newCat);
                        }}
                      >
                        <option value="">(seç)</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </td>
                <td className="p-2 text-right">{Number(t.amount).toLocaleString()}</td>
                <td className="p-2">{t.currency}</td>
                <td className="p-2">{t.description ?? "—"}</td>
                <td className="p-2">{t.merchant ?? "—"}</td>
                <td className="p-2">
                  <button onClick={() => removeTx(t.id)} className="text-red-600 hover:underline">
                    Sil
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="p-4 text-center text-gray-500" colSpan={9}>
                  Kayıt yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}