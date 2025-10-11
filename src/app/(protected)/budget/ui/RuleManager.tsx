

"use client";
import { useEffect, useMemo, useState } from "react";

// İsteğe bağlı: Kategori listesini parent'tan verebilirsin
export type CategoryLite = { id: string; name: string };

type RuleRow = {
  id: string;
  pattern: string;
  isRegex: boolean;
  merchantOnly: boolean;
  priority: number;
  categoryId: string;
  createdAt?: string;
};

type FetchState = {
  items: RuleRow[];
  total: number;
  limit: number;
  offset: number;
};

export default function RuleManager({ categories }: { categories?: CategoryLite[] }) {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FetchState>({ items: [], total: 0, limit, offset });

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RuleRow | null>(null);
  const [form, setForm] = useState<Partial<RuleRow>>({ pattern: "", isRegex: false, merchantOnly: true, priority: 100, categoryId: "" });
  const [busySave, setBusySave] = useState(false);
  const [busyDelete, setBusyDelete] = useState<string | null>(null);

  const catMap = useMemo(() => new Map((categories || []).map((c) => [c.id, c.name])), [categories]);

  async function load() {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (q.trim()) p.set("q", q.trim());
      p.set("limit", String(limit));
      p.set("offset", String(offset));
      const res = await fetch(`/api/budget/rules?${p.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (json?.ok) {
        setData({ items: json.items || [], total: json.total || 0, limit: json.limit || limit, offset: json.offset || offset });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, offset]);

  function resetForm(r?: RuleRow | null) {
    if (r) {
      setForm({ ...r });
      setEditing(r);
    } else {
      setForm({ pattern: "", isRegex: false, merchantOnly: true, priority: 100, categoryId: "" });
      setEditing(null);
    }
  }

  async function save() {
    if (!form.pattern || !form.categoryId) return;
    setBusySave(true);
    try {
      if (editing) {
        const res = await fetch(`/api/budget/rules`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editing.id,
            pattern: form.pattern,
            isRegex: !!form.isRegex,
            merchantOnly: !!form.merchantOnly,
            priority: Number(form.priority || 100),
            categoryId: form.categoryId,
          }),
        });
        const j = await res.json();
        if (j?.ok) {
          setShowForm(false);
          resetForm(null);
          load();
        }
      } else {
        const res = await fetch(`/api/budget/rules`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pattern: form.pattern,
            isRegex: !!form.isRegex,
            merchantOnly: !!form.merchantOnly,
            priority: Number(form.priority || 100),
            categoryId: form.categoryId,
          }),
        });
        const j = await res.json();
        if (j?.ok) {
          setShowForm(false);
          resetForm(null);
          // yeni kayıt geldiğinde başa dön
          setOffset(0);
          load();
        }
      }
    } finally {
      setBusySave(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Bu kural silinsin mi?")) return;
    setBusyDelete(id);
    try {
      const res = await fetch(`/api/budget/rules?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const j = await res.json();
      if (j?.ok) {
        // sayfa doluluğuna göre offset ayarla
        const remaining = data.total - 1;
        const lastPageStart = Math.max(0, Math.floor(remaining / limit) * limit);
        setOffset((prev) => Math.min(prev, lastPageStart));
        load();
      }
    } finally {
      setBusyDelete(null);
    }
  }

  function openCreate() {
    resetForm(null);
    setShowForm(true);
  }
  function openEdit(r: RuleRow) {
    resetForm(r);
    setShowForm(true);
  }

  function pageCount() {
    return Math.max(1, Math.ceil((data.total || 0) / (data.limit || limit)));
  }

  return (
    <div className="rounded-2xl border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">Rule Yönetimi</div>
        <div className="flex items-center gap-2">
          <input
            className="rounded border px-2 py-1 text-sm"
            placeholder="Ara (pattern)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setOffset(0), load())}
          />
          <button onClick={() => { setOffset(0); load(); }} className="rounded border px-3 py-1 text-sm hover:bg-gray-50">
            Ara
          </button>
          <button onClick={openCreate} className="rounded border px-3 py-1 text-sm hover:bg-gray-50">
            + Yeni Kural
          </button>
        </div>
      </div>

      {/* Liste */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2">Pattern</th>
              <th className="py-2">Kategori</th>
              <th className="py-2">Regex</th>
              <th className="py-2">Sadece Merchant</th>
              <th className="py-2 text-right">Öncelik</th>
              <th className="py-2 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="py-4 text-center" colSpan={6}>Yükleniyor…</td></tr>
            ) : data.items.length === 0 ? (
              <tr><td className="py-4 text-center text-gray-500" colSpan={6}>Kural bulunamadı</td></tr>
            ) : (
              data.items.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2 font-mono">{r.pattern}</td>
                  <td className="py-2">{catMap.get(r.categoryId) || r.categoryId}</td>
                  <td className="py-2">{r.isRegex ? "Evet" : "Hayır"}</td>
                  <td className="py-2">{r.merchantOnly ? "Evet" : "Hayır"}</td>
                  <td className="py-2 text-right">{r.priority}</td>
                  <td className="py-2 text-right">
                    <button onClick={() => openEdit(r)} className="mr-2 rounded border px-2 py-1 text-xs hover:bg-gray-50">Düzenle</button>
                    <button disabled={busyDelete === r.id} onClick={() => remove(r.id)} className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50">Sil</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Sayfalama */}
      <div className="mt-3 flex items-center justify-between text-sm">
        <div>Toplam: {data.total}</div>
        <div className="flex items-center gap-2">
          <label>
            Sayfa boyutu
            <select className="ml-2 rounded border px-2 py-1" value={limit} onChange={(e) => (setLimit(Number(e.target.value)), setOffset(0))}>
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button disabled={offset <= 0} onClick={() => setOffset(Math.max(0, offset - limit))} className="rounded border px-2 py-1 hover:bg-gray-50 disabled:opacity-50">Önceki</button>
            <span className="px-2">{Math.floor(offset / limit) + 1} / {pageCount()}</span>
            <button disabled={offset + limit >= data.total} onClick={() => setOffset(offset + limit)} className="rounded border px-2 py-1 hover:bg-gray-50 disabled:opacity-50">Sonraki</button>
          </div>
        </div>
      </div>

      {/* Form paneli (inline modal gibi) */}
      {showForm && (
        <div className="mt-4 rounded-2xl border p-4 bg-gray-50/40">
          <div className="mb-2 font-medium">{editing ? "Kuralı Düzenle" : "Yeni Kural"}</div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-sm">
              Pattern
              <input className="mt-1 w-full rounded border px-2 py-1" value={form.pattern || ""} onChange={(e) => setForm((s) => ({ ...s, pattern: e.target.value }))} />
            </label>

            <label className="text-sm">
              Kategori
              {categories?.length ? (
                <select
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={form.categoryId || ""}
                  onChange={(e) => setForm((s) => ({ ...s, categoryId: e.target.value }))}
                >
                  <option value="" disabled>Seçiniz…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="mt-1 w-full rounded border px-2 py-1"
                  placeholder="categoryId"
                  value={form.categoryId || ""}
                  onChange={(e) => setForm((s) => ({ ...s, categoryId: e.target.value }))}
                />
              )}
            </label>

            <label className="text-sm flex items-center gap-2">
              <input type="checkbox" checked={!!form.isRegex} onChange={(e) => setForm((s) => ({ ...s, isRegex: e.target.checked }))} /> Regex
            </label>

            <label className="text-sm flex items-center gap-2">
              <input type="checkbox" checked={!!form.merchantOnly} onChange={(e) => setForm((s) => ({ ...s, merchantOnly: e.target.checked }))} /> Sadece Merchant
            </label>

            <label className="text-sm">
              Öncelik (küçük önce)
              <input type="number" className="mt-1 w-full rounded border px-2 py-1" value={Number(form.priority || 100)} onChange={(e) => setForm((s) => ({ ...s, priority: Number(e.target.value) }))} />
            </label>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button onClick={() => { setShowForm(false); resetForm(null); }} className="rounded border px-3 py-1 hover:bg-gray-50">İptal</button>
            <button onClick={save} disabled={busySave || !form.pattern || !form.categoryId} className="rounded border px-3 py-1 hover:bg-gray-50 disabled:opacity-50">
              {busySave ? "Kaydediliyor…" : editing ? "Güncelle" : "Ekle"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}