"use client";

import { useState } from "react";

type Props = {
  holding: {
    id: string;
    symbol: string;
    quantity: number | string | null;
    avgCost: number | string | null;
    accountId: string;
    currency?: string | null;
  };
};

export default function HoldingActions({ holding }: Props) {
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!confirm(`${holding.symbol} kaydını silmek istediğine emin misin?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/holdings/${holding.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.text()) || "Silme başarısız");
      location.reload();
    } catch (err: any) {
      alert(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onQuickEdit() {
    const currentQty =
      typeof holding.quantity === "number"
        ? holding.quantity
        : Number(holding.quantity ?? 0);
    const currentAvg =
      typeof holding.avgCost === "number"
        ? holding.avgCost
        : Number(holding.avgCost ?? 0);

    const qtyStr = prompt("Yeni adet (quantity):", String(currentQty));
    if (qtyStr == null) return;

    const avgStr = prompt("Yeni ortalama maliyet (avgCost, TRY):", String(currentAvg));
    if (avgStr == null) return;

    const quantity = Number(qtyStr);
    const avgPrice = Number(avgStr);
    if (!isFinite(quantity) || !isFinite(avgPrice)) {
      alert("Geçerli bir sayı girin.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/holdings/${holding.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity, avgPrice }),
      });
      if (!res.ok) throw new Error((await res.text()) || "Güncelleme başarısız");
      location.reload();
    } catch (err: any) {
      alert(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={busy}
        onClick={onQuickEdit}
        className="text-xs rounded border px-2 py-1 hover:bg-muted disabled:opacity-50"
        title="Hızlı düzenle (adet / ort. maliyet)"
      >
        Düzenle
      </button>
      <button
        disabled={busy}
        onClick={onDelete}
        className="text-xs rounded border px-2 py-1 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
        title="Kaydı sil"
      >
        Sil
      </button>
    </div>
  );
}