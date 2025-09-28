"use client";
import { useEffect, useState } from "react";

export default function RulesManager({
  categories,
}: {
  categories: { id: string; name: string }[];
}) {
  const [rules, setRules] = useState<any[]>([]);
  const [form, setForm] = useState({
    pattern: "",
    isRegex: false,
    merchantOnly: false,
    priority: 100,
    categoryId: categories[0]?.id ?? "",
  });

  async function load() {
    const r = await fetch("/api/rules").then((r) => r.json());
    setRules(r);
  }
  useEffect(() => { load(); }, []);

  async function addRule() {
    const res = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({ ...form, pattern: "" });
      await load();
    } else {
      alert("Kural eklenemedi");
    }
  }
  async function del(id: string) {
    await fetch(`/api/rules/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Kurallar</h3>
      <div className="grid md:grid-cols-6 gap-2 items-end">
        <div className="md:col-span-2">
          <label className="text-xs">Pattern</label>
          <input className="border rounded w-full px-2 py-1"
            value={form.pattern}
            onChange={(e) => setForm((s) => ({ ...s, pattern: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs">Kategori</label>
          <select className="border rounded w-full px-2 py-1"
            value={form.categoryId}
            onChange={(e) => setForm((s) => ({ ...s, categoryId: e.target.value }))}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs">Öncelik</label>
          <input type="number" className="border rounded w-full px-2 py-1"
            value={form.priority}
            onChange={(e) => setForm((s) => ({ ...s, priority: Number(e.target.value) }))} />
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox"
            checked={form.isRegex}
            onChange={(e) => setForm((s) => ({ ...s, isRegex: e.target.checked }))} />
          Regex
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox"
            checked={form.merchantOnly}
            onChange={(e) => setForm((s) => ({ ...s, merchantOnly: e.target.checked }))} />
          Sadece merchant
        </label>
        <button onClick={addRule}
          className="px-3 py-2 bg-black text-white rounded">Ekle</button>
      </div>

      <div className="border rounded overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2">Öncelik</th>
              <th className="p-2">Pattern</th>
              <th className="p-2">Regex?</th>
              <th className="p-2">Merchant only?</th>
              <th className="p-2">Kategori</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.priority}</td>
                <td className="p-2 font-mono">{r.pattern}</td>
                <td className="p-2">{r.isRegex ? "✓" : ""}</td>
                <td className="p-2">{r.merchantOnly ? "✓" : ""}</td>
                <td className="p-2">{r.category?.name}</td>
                <td className="p-2">
                  <button onClick={() => del(r.id)} className="text-red-600">Sil</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}