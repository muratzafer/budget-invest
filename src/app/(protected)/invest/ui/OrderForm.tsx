"use client";

import { useState } from "react";

type Props = {
  accounts: { id: string; name: string }[];
};

export default function OrderForm({ accounts }: Props) {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [quantity, setQuantity] = useState<number>(0.1);
  const [price, setPrice] = useState<number>(65000);
  const [asOf, setAsOf] = useState<string>(new Date().toISOString().slice(0, 16)); // input type="datetime-local"
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          side,
          accountId,
          quantity: Number(quantity),
          price: Number(price),
          currency: "USDT",
          asOf: new Date(asOf).toISOString(),
          source: "manual",
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Order failed");
      }
      // sayfayı yenilemeden tabloyu güncellemek istersen:
      // useRouter().refresh(); (Next 15: import { useRouter } from 'next/navigation')
      location.reload();
    } catch (err: any) {
      alert(err.message || "Hata");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border p-4 grid grid-cols-2 gap-3">
      <div className="col-span-1">
        <label className="block text-sm mb-1">Hesap</label>
        <select
          className="w-full rounded border p-2 bg-background"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <div className="col-span-1">
        <label className="block text-sm mb-1">Sembol</label>
        <input
          className="w-full rounded border p-2 bg-background"
          value={symbol}
          onChange={e => setSymbol(e.target.value.toUpperCase())}
        />
      </div>

      <div>
        <label className="block text-sm mb-1">Yön</label>
        <select
          className="w-full rounded border p-2 bg-background"
          value={side}
          onChange={e => setSide(e.target.value as "buy" | "sell")}
        >
          <option value="buy">Buy</option>
          <option value="sell">Sell</option>
        </select>
      </div>

      <div>
        <label className="block text-sm mb-1">Miktar</label>
        <input
          type="number"
          step="any"
          className="w-full rounded border p-2 bg-background"
          value={quantity}
          onChange={e => setQuantity(Number(e.target.value))}
        />
      </div>

      <div>
        <label className="block text-sm mb-1">Fiyat</label>
        <input
          type="number"
          step="any"
          className="w-full rounded border p-2 bg-background"
          value={price}
          onChange={e => setPrice(Number(e.target.value))}
        />
      </div>

      <div>
        <label className="block text-sm mb-1">Tarih/Saat</label>
        <input
          type="datetime-local"
          className="w-full rounded border p-2 bg-background"
          value={asOf}
          onChange={e => setAsOf(e.target.value)}
        />
      </div>

      <div className="col-span-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded border px-3 py-2"
        >
          {loading ? "Gönderiliyor…" : "Emir Oluştur"}
        </button>
      </div>
    </form>
  );
}