"use client";

import { useState } from "react";

// Robust number coercion for Decimal/string/number inputs
function toNum(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  if (typeof v?.toNumber === "function") return v.toNumber();
  try {
    return Number(v);
  } catch {
    return 0;
  }
}

// Minimum shape required by the table/actions
export type HoldingForActions = {
  marketPrice: any;
  marketValue: any;
  pnl: number;
  pnlPct: number;
  id: string;
  symbol: string;
  quantity: number;
  avgPrice: number | null;
  currency: string;
  avgCost: number | null;
  account?: { id: string; name: string } | null;
  accountId?: string | null;
};

type Props = {
  holding: HoldingForActions;
  onChanged?: () => void;
};

export default function HoldingActions({ holding, onChanged }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!confirm(`${holding.symbol} kaydını silmek istiyor musun?`)) return;
    try {
      setBusy(true);
      const res = await fetch(`/api/holdings/${holding.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      onChanged?.();
    } catch (e: any) {
      alert(e?.message ?? "Silme sırasında bir hata oluştu");
    } finally {
      setBusy(false);
    }
  }

  async function handleQuickEdit() {
    const qtyStr = prompt("Yeni adet (quantity):", String(toNum(holding.quantity ?? 0)));
    if (qtyStr == null) return;

    const avgStr = prompt(
      `Yeni ortalama maliyet (avgPrice, ${holding.currency ?? "TRY"}):`,
      String(toNum(holding.avgPrice ?? 0))
    );
    if (avgStr == null) return;

    const quantity = Number(qtyStr);
    const avgPrice = Number(avgStr);
    if (!isFinite(quantity) || !isFinite(avgPrice)) {
      alert("Geçerli sayılar girin.");
      return;
    }

    try {
      setBusy(true);
      const res = await fetch(`/api/holdings/${holding.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity, avgPrice }),
      });
      if (!res.ok) throw new Error(await res.text());
      onChanged?.();
    } catch (e: any) {
      alert(e?.message ?? "Güncelleme başarısız");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={handleQuickEdit}
        className="text-xs rounded border px-2 py-1 hover:bg-muted disabled:opacity-50"
        title="Hızlı düzenle (adet / ort. maliyet)"
      >
        Düzenle
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={handleDelete}
        className="text-xs rounded border px-2 py-1 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
        title="Kaydı sil"
      >
        Sil
      </button>
    </div>
  );
}