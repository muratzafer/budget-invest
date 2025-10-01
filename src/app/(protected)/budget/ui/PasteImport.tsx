"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Account = { id: string; name: string; currency: string; type: string };
type Category = { id: string; name: string; type: "income" | "expense" };

export default function PasteImport({
  accounts,
  categories,
}: {
  accounts: Account[];
  categories: Category[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [defaultAccount, setDefaultAccount] = useState(accounts[0]?.id ?? "");
  const [loading, setLoading] = useState(false);

  function parseLines(t: string) {
    // satırları böl, tsv/csv benzeri, ilk satır başlık olabilir
    const rows = t
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split(/\t|,/).map((s) => s.trim()))
      .filter((arr) => arr.filter(Boolean).length > 0);

    if (rows.length === 0) return [];

    // Başlık var mı?
    const header = rows[0].map((h) => h.toLowerCase());
    const looksHeader =
      header.includes("date") && header.includes("amount") && header.includes("type");

    const dataRows = looksHeader ? rows.slice(1) : rows;

    // kolon sırası: date,type,amount,currency,account,category,description,merchant
    return dataRows.map((r) => {
      const [date, typeRaw, amountRaw, currencyRaw, accountName, categoryName, desc, merch] = r;
      const type = (typeRaw || "expense").toLowerCase() as "income" | "expense" | "transfer";
      const accountId =
        accounts.find((a) => a.name === accountName)?.id ?? defaultAccount;
      const categoryId =
        categories.find((c) => c.name === categoryName)?.id ?? null;

      return {
        accountId,
        categoryId,
        type: type === "income" || type === "transfer" ? type : "expense",
        amount: Number(String(amountRaw).replace(",", ".")),
        currency: currencyRaw || "TRY",
        description: desc || null,
        merchant: merch || null,
        occurredAt: date || new Date().toISOString().slice(0, 10),
      };
    });
  }

  async function importNow() {
    const items = parseLines(text);
    if (!items.length) {
      alert("Yapıştırılan içerik boş görünüyor.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/transactions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error("İçe aktarma başarısız");
      router.refresh();
      setText("");
      alert("Toplu ekleme tamamlandı ✅");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-medium">Toplu Ekle (Yapıştır)</h3>
      <div className="flex items-center gap-2">
        <span className="text-sm">Varsayılan Hesap:</span>
        <select
          value={defaultAccount}
          onChange={(e) => setDefaultAccount(e.target.value)}
          className="border rounded px-2 py-1"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={`date,type,amount,currency,account,category,description,merchant
2025-09-01,expense,45.9,TRY,Banka,Market,Akşam alışverişi,A101`}
        className="w-full border rounded p-3 font-mono text-sm"
      />
      <button
        onClick={importNow}
        disabled={!text.trim() || loading}
        className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
      >
        {loading ? "İçe aktarılıyor..." : "Yapıştırılanları ekle"}
      </button>
    </div>
  );
}