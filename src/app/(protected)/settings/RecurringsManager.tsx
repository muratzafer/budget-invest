

"use client";

import { useEffect, useState } from "react";

type Rec = {
  id: string;
  type: string;
  accountId: string;
  categoryId?: string | null;
  amount: number;
  currency: string;
  description?: string | null;
  merchant?: string | null;
  interval: string;
  dayOfMonth?: number | null;
  weekday?: number | null;
  everyNDays?: number | null;
  nextRunAt: string;
  isActive: boolean;
};

export default function RecurringsManager() {
  const [items, setItems] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/recurrings");
    setItems(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addDemo() {
    await fetch("/api/recurrings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "expense",
        accountId: "<Banka veya Nakit hesap ID>",
        categoryId: null,
        amount: 250,
        currency: "TRY",
        description: "Aylık üyelik",
        interval: "monthly",
        dayOfMonth: 1,
        nextRunAt: new Date().toISOString(),
      }),
    });
    await load();
  }

  async function runNow() {
    await fetch("/api/recurrings/run-due", { method: "POST" });
    alert("Uygun planlar çalıştırıldı.");
  }

  async function toggleActive(id: string, isActive: boolean) {
    await fetch(`/api/recurrings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    await load();
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">Yinelenen İşlemler</h2>

      <div className="flex gap-2">
        <button onClick={addDemo} className="rounded border px-3 py-1">Demo Plan Ekle</button>
        <button onClick={runNow} className="rounded border px-3 py-1">Uygun Planları Çalıştır</button>
      </div>

      {loading ? <div>Yükleniyor…</div> : (
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500">
            <tr>
              <th>Tür</th><th>Tutar</th><th>Periyot</th><th>Sonraki</th><th>Aktif</th><th></th>
            </tr>
          </thead>
          <tbody>
            {items.map(r => (
              <tr key={r.id} className="border-t">
                <td>{r.type}</td>
                <td>₺ {new Intl.NumberFormat("tr-TR").format(r.amount)}</td>
                <td>{r.interval}</td>
                <td>{new Date(r.nextRunAt).toLocaleString("tr-TR")}</td>
                <td>{r.isActive ? "✓" : "—"}</td>
                <td>
                  <button className="text-blue-600" onClick={() => toggleActive(r.id, !r.isActive)}>
                    {r.isActive ? "Durdur" : "Aktifleştir"}
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={6} className="py-2 text-gray-500">Plan yok.</td></tr>}
          </tbody>
        </table>
      )}
    </section>
  );
}