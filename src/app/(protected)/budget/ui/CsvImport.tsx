"use client";

import Papa from "papaparse";
import { useMemo, useState } from "react";

type Account = { id: string; name: string; currency: string; type: string };
type Category = { id: string; name: string; type: "income" | "expense" };

const KNOWN_COLUMNS = [
  "date","type","amount","currency","account","category","description","merchant"
] as const;
type Known = typeof KNOWN_COLUMNS[number];

export default function CsvImport({
  accounts, categories, onImported,
}: {
  accounts: Account[];
  categories: Category[];
  onImported?: () => void;
}) {
  const [rows, setRows] = useState<Record<string,string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<Known,string>>({
    date: "date",
    type: "type",
    amount: "amount",
    currency: "currency",
    account: "account",
    category: "category",
    description: "description",
    merchant: "merchant",
  });
  const [defaultAccount, setDefaultAccount] = useState(accounts[0]?.id ?? "");
  const [loading, setLoading] = useState(false);

  function onFile(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const data = (res.data as any[]).map((r) => Object.fromEntries(
          Object.entries(r).map(([k,v]) => [String(k).trim(), String(v ?? "").trim()])
        ));
        setRows(data);
        const hdrs = res.meta.fields?.map((f) => String(f)) ?? [];
        setHeaders(hdrs);
      },
    });
  }

  const preview = useMemo(() => rows.slice(0, 5), [rows]);

  async function importNow() {
    if (rows.length === 0) return;
    setLoading(true);
    try {
      // eşleme ile normalize et
      const items = rows.map((r) => {
        const type = (r[mapping.type] || "expense").toLowerCase();
        const accountName = r[mapping.account];
        const accountId = accounts.find(a => a.name === accountName)?.id || defaultAccount;

        const catName = r[mapping.category];
        const categoryId = categories.find(c => c.name === catName)?.id ?? null;

        const amount = Number(String(r[mapping.amount]).replace(",", "."));
        const currency = r[mapping.currency] || "TRY";
        const date = r[mapping.date] || new Date().toISOString().slice(0,10);

        return {
          accountId,
          categoryId,
          type: (type === "income" || type === "transfer") ? type : "expense",
          amount,
          currency,
          description: r[mapping.description] || null,
          merchant: r[mapping.merchant] || null,
          occurredAt: date,
        };
      });

      const res = await fetch("/api/transactions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error("İçe aktarma başarısız");
      onImported?.();
      alert("İçe aktarma tamamlandı ✅");
    } catch (e:any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <div className="flex items-center gap-2">
          <span className="text-sm">Varsayılan Hesap:</span>
          <select
            value={defaultAccount}
            onChange={(e) => setDefaultAccount(e.target.value)}
            className="border rounded px-2 py-1"
          >
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      {headers.length > 0 && (
        <div className="grid md:grid-cols-4 gap-2">
          {KNOWN_COLUMNS.map((k) => (
            <div key={k} className="flex flex-col">
              <label className="text-xs uppercase">{k}</label>
              <select
                value={mapping[k]}
                onChange={(e) => setMapping((m) => ({ ...m, [k]: e.target.value }))}
                className="border rounded px-2 py-1"
              >
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {preview.length > 0 && (
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-100">
              <tr>
                {Object.keys(preview[0]).map((h) => <th key={h} className="text-left p-2">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {preview.map((r, i) => (
                <tr key={i} className="border-t">
                  {Object.values(r).map((v, j) => <td key={j} className="p-2">{String(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={importNow}
        disabled={rows.length === 0 || loading}
        className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
      >
        {loading ? "İçe aktarılıyor..." : "CSV'yi içe aktar"}
      </button>
    </div>
  );
}