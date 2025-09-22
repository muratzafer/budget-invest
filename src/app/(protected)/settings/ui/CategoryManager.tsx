"use client";

import { useState } from "react";

type Category = {
  id: string;
  name: string;
  type: "income" | "expense";
  parentId: string | null;
};

export default function CategoryManager({ initialCategories }: { initialCategories: Category[] }) {
  const [items, setItems] = useState<Category[]>(initialCategories);
  const [name, setName] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function addCategory() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j?.error ? JSON.stringify(j.error) : "Hata");
      }
      const created: Category = await res.json();
      setItems((s) => [...s, created].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setType("expense");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    const prev = items;
    setItems((s) => s.filter((x) => x.id !== id));
    const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
    if (!res.ok) {
      // geri al
      setItems(prev);
      alert("Silme işlemi başarısız.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-end">
        <div className="flex flex-col">
          <label className="text-sm">Ad</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border rounded px-3 py-2"
            placeholder="Örn. Market"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm">Tür</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as any)}
            className="border rounded px-3 py-2"
          >
            <option value="expense">expense</option>
            <option value="income">income</option>
          </select>
        </div>
        <button
          onClick={addCategory}
          disabled={loading || !name.trim()}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
        >
          {loading ? "Ekleniyor..." : "Ekle"}
        </button>
      </div>

      {err && <p className="text-red-600 text-sm">{err}</p>}

      <ul className="divide-y rounded border">
        {items.map((c) => (
          <li key={c.id} className="flex items-center justify-between px-3 py-2">
            <span>{c.name} <span className="text-xs text-gray-500">[{c.type}]</span></span>
            <button onClick={() => remove(c.id)} className="text-red-600 hover:underline">
              Sil
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="px-3 py-2 text-gray-500">Henüz kategori yok.</li>}
      </ul>
    </div>
  );
}