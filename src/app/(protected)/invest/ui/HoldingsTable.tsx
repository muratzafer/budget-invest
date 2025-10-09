"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** ---------------- Types ---------------- */
export type Holding = {
  id?: string;
  symbol: string;      // e.g. BTCUSDT, XAUUSD, AAPL
  quantity: number;    // owned amount
  avgCost: number;     // average cost in quote currency (TRY by default)
  assetType?: string;  // optional: "crypto" | "equity" | "gold" | "fx"
  currency?: string;   // optional: e.g. "TRY", "USD"
};

type LiveMap = Record<string, { price: number; asOf?: string; source?: string }>;

type Props = {
  holdings: Holding[];
  currency?: string;       // display currency, default TRY
  pollMs?: number;         // polling interval for /api/prices, default 5000
  latestPriceBySymbol ?: Record<string, number>; // optional pre-fetched latest prices
  baseCurrency ?: string;  // optional base currency for PnL calc, default TRY
};

/** ---------------- Helpers ---------------- */
function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function fmtCurrency(n: number, currency = "TRY") {
  const v = Number(n ?? 0);
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(v)} ${currency}`;
  }
}
function fmtPercent(n: number) {
  const v = Number(n ?? 0);
  return `${v.toFixed(2)}%`;
}

// Returns the most common element in arr, or fallback if arr is empty
function mode(arr: (string | undefined)[], fallback: string): string {
  const counts: Record<string, number> = {};
  for (const v of arr) {
    if (!v) continue;
    counts[v] = (counts[v] || 0) + 1;
  }
  let max = 0;
  let result = fallback;
  for (const k in counts) {
    if (counts[k] > max) {
      max = counts[k];
      result = k;
    }
  }
  return result;
}

// Heuristic guess for asset type from symbol (or fallback)
function guessAssetType(symbol: string): string {
  const sym = symbol.trim().toUpperCase();
  if (/BTC|ETH|USDT|BNB|SOL|ADA|XRP|DOGE|AVAX|MATIC|SHIB|DOT|TRX|LINK|UNI|LTC|WBTC|DAI|FIL|ETC|APT|ARB|OP|PEPE|SUI|INJ|STX|XMR|XLM|TUSD|USDC|BUSD|USDT|CRV|AAVE|SNX|COMP|MKR|YFI|SAND|MANA|AXS|ENJ|GALA|GMT|APE|FLOW|CHZ|1INCH|BAT|ZRX|CVC|GNT|OMG|KNC/.test(sym)) return "crypto";
  if (/XAU|XAG|XPT|XPD|GAU|ALTIN|GOLD|SILVER|PLATINUM|PALADYUM/.test(sym)) return "gold";
  if (/USDTRY|EURTRY|EURUSD|GBPUSD|JPYUSD|USDEUR|USDTL|EURTL|GBPTRY|CHFTRY|AUDUSD|USDCAD|USDJPY|USDCHF|NZDUSD|USDMXN|USDZAR|USDHKD|USDNOK|USDDKK|USDSEK|USDPLN|USDHUF|USDILS|USDCNH|USDINR|USDIDR|USDSGD|USDTHB|USDKRW|USDTWD|USDPHP|USDVND|USDMYR|USDCZK|USDCLP|USDARS|USDTRY|EURUSD|EURGBP|EURJPY|EURCHF|EURAUD|EURNZD|EURCAD|EURSEK|EURNOK|EURDKK|EURPLN|EURHUF|EURCZK|EURTRY/.test(sym)) return "fx";
  if (/^[A-Z]{1,5}$/.test(sym)) return "equity";
  // fallback: if symbol ends with TRY/USD/EUR, treat as FX
  if (/(TRY|USD|EUR)$/.test(sym)) return "fx";
  return "crypto";
}

/**
 * A tiny client that polls `/api/prices?symbols=...` and dispatches
 * `live-prices` CustomEvent so multiple widgets can consume the stream.
 */
export function LivePricesClient({ symbols, intervalMs = 5000 }: { symbols: string[]; intervalMs?: number }) {
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!symbols || symbols.length === 0) return;

    async function tick() {
      try {
        const params = new URLSearchParams({
          mode: "live",
          symbols: Array.from(new Set(symbols.filter(Boolean))).join(","),
        });
        const res = await fetch(`/api/prices?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const map: LiveMap = Array.isArray(data)
          ? data.reduce((acc: LiveMap, it: any) => {
              const sym = it.symbol || it.ticker || it.code;
              const price = Number(it.price ?? it.lastPrice);
              if (sym && Number.isFinite(price)) {
                acc[sym] = { price, asOf: it.asOf ?? it.time, source: it.source };
              }
              return acc;
            }, {})
          : Object.keys(data || {}).reduce((acc: LiveMap, k) => {
              const v = (data as any)[k];
              const price = Number(v?.price ?? v?.lastPrice);
              if (Number.isFinite(price)) acc[k] = { price, asOf: v?.asOf, source: v?.source };
              return acc;
            }, {});
        if (Object.keys(map).length > 0) {
          window.dispatchEvent(new CustomEvent("live-prices", { detail: map }));
        }
      } catch {/* ignore transient */}
    }

    tick();
    timer.current = window.setInterval(tick, intervalMs);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [symbols?.join(","), intervalMs]);

  return null;
}

/** ---------------- Table ---------------- */
export default function HoldingsTable({ holdings, currency = "TRY", pollMs = 5000, latestPriceBySymbol }: Props) {
  const [editing, setEditing] = useState<null | Holding>(null);
  const [form, setForm] = useState<{ quantity: string; avgCost: string }>({ quantity: "", avgCost: "" });

  // Create modal state
  const [creating, setCreating] = useState(false);
  const [assetTypeTouched, setAssetTypeTouched] = useState(false);
  // Infer defaults from existing holdings
  const defaultAssetType = useMemo(() => {
    return mode((holdings || []).map(h => h.assetType), "crypto");
  }, [holdings]);
  const defaultCurrency = useMemo(() => {
    return mode((holdings || []).map(h => h.currency), "TRY");
  }, [holdings]);
  const [createForm, setCreateForm] = useState<{
    symbol: string;
    assetType: string;
    currency: string;
    quantity: string;
    avgCost: string;
  }>({
    symbol: "",
    assetType: defaultAssetType,
    currency: defaultCurrency,
    quantity: "",
    avgCost: "",
  });
  // When opening, use inferred defaults
  function openCreate() {
    setCreating(true);
    setAssetTypeTouched(false);
    setCreateForm({ symbol: "", assetType: defaultAssetType, currency: defaultCurrency, quantity: "", avgCost: "" });
  }
  function closeCreate() {
    setCreating(false);
    setAssetTypeTouched(false);
    setCreateForm({ symbol: "", assetType: defaultAssetType, currency: defaultCurrency, quantity: "", avgCost: "" });
  }
  // Heuristic update on symbol change
  function onCreateChange<K extends keyof typeof createForm>(k: K, v: string) {
    setCreateForm((f) => {
      if (k === "symbol" && !assetTypeTouched) {
        // Guess asset type from symbol
        const guessedAssetType = guessAssetType(v);
        return { ...f, [k]: v, assetType: guessedAssetType };
      }
      return { ...f, [k]: v };
    });
  }
  async function saveCreate() {
    try {
      const body = {
        symbol: createForm.symbol.trim().toUpperCase(),
        assetType: createForm.assetType,
        currency: createForm.currency,
        quantity: Number(createForm.quantity),
        avgCost: Number(createForm.avgCost),
      } as any;
      const res = await fetch("/api/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Kayıt eklenemedi");
      }
      if (typeof window !== "undefined") window.location.reload();
    } catch (e) {
      console.error(e);
      alert((e as any)?.message || "Kayıt eklenemedi");
    } finally {
      closeCreate();
    }
  }

  function openEdit(h: Holding) {
    setEditing(h);
    setForm({ quantity: String(h.quantity ?? 0), avgCost: String(h.avgCost ?? 0) });
  }
  function closeEdit() {
    setEditing(null);
    setForm({ quantity: "", avgCost: "" });
  }
  function onFormChange<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  async function saveEdit() {
    if (!editing?.id) { closeEdit(); return; }
    try {
      const body = {
        id: editing.id,
        quantity: Number(form.quantity),
        avgCost: Number(form.avgCost),
      } as any;
      const res = await fetch("/api/holdings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Güncelleme başarısız");
      }
      // Basit çözüm: sayfayı yenile
      if (typeof window !== "undefined") window.location.reload();
    } catch (e) {
      console.error(e);
      alert((e as any)?.message || "Güncelleme başarısız");
    } finally {
      closeEdit();
    }
  }
  async function deleteRow(id?: string) {
    if (!id) return;
    if (!confirm("Bu varlığı silmek istediğine emin misin?")) return;
    try {
      const res = await fetch(`/api/holdings?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Silme başarısız");
      }
      if (typeof window !== "undefined") window.location.reload();
    } catch (e) {
      console.error(e);
      alert((e as any)?.message || "Silme başarısız");
    }
  }

  const [live, setLive] = useState<LiveMap>({});
  const prev = useRef<LiveMap>({});

  const [sort, setSort] = useState<{ key: 'symbol' | 'quantity' | 'avgCost' | 'lastPrice' | 'marketValue' | 'bookValue' | 'pnl' | 'pnlPct' | 'weightPct'; dir: 'asc' | 'desc' }>({
    key: 'marketValue',
    dir: 'desc',
  });

  function toggleSort(key: typeof sort.key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
  }

  // Subscribe to broadcasted prices
  useEffect(() => {
    function onLive(e: Event) {
      const detail = (e as CustomEvent<LiveMap>).detail;
      if (!detail) return;
      // keep the last snapshot (if you want to use it later)
      prev.current = detail;
      setLive(detail);
    }
    window.addEventListener("live-prices", onLive as EventListener);
    return () => {
      window.removeEventListener("live-prices", onLive as EventListener);
    };
  }, []);

  // seed with server-provided latest prices if available
  useEffect(() => {
    // Prop may come as {SYM: price}
    if (!holdings || !Array.isArray(holdings) || !latestPriceBySymbol) return;
    const seeded: LiveMap = {};
    Object.entries(latestPriceBySymbol).forEach(([sym, price]) => {
      const p = Number(price);
      if (Number.isFinite(p)) seeded[sym] = { price: p };
    });
    if (Object.keys(seeded).length > 0) setLive((prev) => ({ ...seeded, ...prev }));
  }, [latestPriceBySymbol, holdings]);

  const symbols = useMemo(() => Array.from(new Set((holdings || []).map(h => h.symbol).filter(Boolean))), [holdings]);

  const rows = useMemo(() => {
    return (holdings || []).map((h) => {
      const last = toNumber(live[h.symbol]?.price);
      const qty = toNumber(h.quantity);
      const avg = toNumber(h.avgCost);
      const book = qty * avg;
      const mkt = qty * (last || 0);
      const pnl = mkt - book;
      const pnlPct = book !== 0 ? (pnl / book) * 100 : 0;
      return {
        ...h,
        lastPrice: last,
        lastAsOf: live[h.symbol]?.asOf,
        lastSource: live[h.symbol]?.source,
        marketValue: mkt,
        bookValue: book,
        pnl,
        pnlPct,
      };
    });
  }, [holdings, live]);

  const portfolioTotal = useMemo(() => {
    return (rows || []).reduce((acc, r: any) => acc + Number(r.marketValue ?? 0), 0);
  }, [rows]);

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    const k = sort.key;
    arr.sort((a: any, b: any) => {
      let av: number;
      let bv: number;
      if (k === 'weightPct') {
        av = portfolioTotal ? (Number(a.marketValue ?? 0) / portfolioTotal) * 100 : 0;
        bv = portfolioTotal ? (Number(b.marketValue ?? 0) / portfolioTotal) * 100 : 0;
      } else {
        av = Number(a[k] ?? 0);
        bv = Number(b[k] ?? 0);
      }
      if (av === bv) return 0;
      return sort.dir === 'asc' ? av - bv : bv - av;
    });
    return arr;
  }, [rows, sort, portfolioTotal]);

  const totals = useMemo(() => {
    return sortedRows.reduce(
      (acc, r) => {
        acc.marketValue += Number(r.marketValue ?? 0);
        acc.bookValue += Number(r.bookValue ?? 0);
        acc.pnl += Number(r.pnl ?? 0);
        return acc;
      },
      { marketValue: 0, bookValue: 0, pnl: 0 }
    );
  }, [sortedRows]);

  const lastUpdate = useMemo(() => {
    const times = Object.values(live || {})
      .map((v) => (v.asOf ? new Date(v.asOf).getTime() : 0))
      .filter((t) => Number.isFinite(t) && t > 0);
    if (times.length === 0) return '';
    const t = new Date(Math.max(...times));
    return t.toLocaleString('tr-TR');
  }, [live]);

  const totalsPnlPct = totals.bookValue !== 0 ? (totals.pnl / totals.bookValue) * 100 : 0;

  // When holdings change (and not touched), update defaults in form if modal is open
  useEffect(() => {
    if (!creating) return;
    setCreateForm((f) => {
      // Only update assetType/currency if untouched or empty
      let updated = { ...f };
      if (!assetTypeTouched && (!f.assetType || f.assetType === "")) {
        updated.assetType = defaultAssetType;
      }
      if (!f.currency || f.currency === "") {
        updated.currency = defaultCurrency;
      }
      return updated;
    });
  }, [defaultAssetType, defaultCurrency, holdings, creating, assetTypeTouched]);

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-medium">Varlıklar</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCreate}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
          >Yeni Holding Ekle</button>
          <div className="text-xs text-gray-500">{lastUpdate ? `Son güncelleme: ${lastUpdate}` : ''}</div>
        </div>
      </div>

      {/* live poller */}
      <LivePricesClient symbols={symbols} intervalMs={pollMs} />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="py-2">
                <button type="button" onClick={() => toggleSort('symbol')} className="flex items-center gap-1">
                  Sembol {sort.key === 'symbol' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                </button>
              </th>
              <th className="py-2 text-right">
                <button type="button" onClick={() => toggleSort('quantity')} className="inline-flex items-center gap-1 w-full justify-end">
                  Adet {sort.key === 'quantity' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                </button>
              </th>
              <th className="py-2 text-right">
                <button type="button" onClick={() => toggleSort('avgCost')} className="inline-flex items-center gap-1 w-full justify-end">
                  Ort. Maliyet {sort.key === 'avgCost' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                </button>
              </th>
              <th className="py-2 text-right">
                <button type="button" onClick={() => toggleSort('lastPrice')} className="inline-flex items-center gap-1 w-full justify-end">
                  Son Fiyat {sort.key === 'lastPrice' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                </button>
              </th>
              <th className="py-2 text-right">
                <button type="button" onClick={() => toggleSort('marketValue')} className="inline-flex items-center gap-1 w-full justify-end">
                  Piyasa Değeri {sort.key === 'marketValue' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                </button>
              </th>
              <th className="py-2 text-right">
                <button type="button" onClick={() => toggleSort('weightPct')} className="inline-flex items-center gap-1 w-full justify-end">
                  Portföy % {sort.key === 'weightPct' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                </button>
              </th>
              <th className="py-2 text-right">
                <button type="button" onClick={() => toggleSort('bookValue')} className="inline-flex items-center gap-1 w-full justify-end">
                  Maliyet {sort.key === 'bookValue' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                </button>
              </th>
              <th className="py-2 text-right">
                <button type="button" onClick={() => toggleSort('pnl')} className="inline-flex items-center gap-1 w-full justify-end">
                  PnL {sort.key === 'pnl' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                </button>
              </th>
              <th className="py-2 text-right">
                <button type="button" onClick={() => toggleSort('pnlPct')} className="inline-flex items-center gap-1 w-full justify-end">
                  PnL % {sort.key === 'pnlPct' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                </button>
              </th>
              <th className="py-2 text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <tr key={r.symbol} className="border-t">
                <td className="py-2 font-medium">{r.symbol}</td>
                <td className="py-2 text-right">{new Intl.NumberFormat("tr-TR").format(toNumber(r.quantity))}</td>
                <td className="py-2 text-right">{fmtCurrency(toNumber(r.avgCost), currency)}</td>
                <td className="py-2 text-right">
                  {r.lastPrice ? fmtCurrency(r.lastPrice, currency) : "—"}
                  {(r.lastSource || r.lastAsOf) && (
                    <div className="mt-0.5 text-[10px] text-gray-500">
                      {r.lastSource ? (r.lastSource === "binance" ? "Binance" : "Yahoo") : ""}
                      {r.lastAsOf ? ` • ${new Date(r.lastAsOf).toLocaleTimeString("tr-TR")}` : ""}
                    </div>
                  )}
                </td>
                <td className="py-2 text-right">{fmtCurrency(r.marketValue, currency)}</td>
                <td className="py-2 text-right">{portfolioTotal ? fmtPercent((Number(r.marketValue ?? 0) / portfolioTotal) * 100) : '—'}</td>
                <td className="py-2 text-right">{fmtCurrency(r.bookValue, currency)}</td>
                <td className={`py-2 text-right ${r.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtCurrency(r.pnl, currency)}</td>
                <td className={`py-2 text-right ${r.pnlPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{toNumber(r.pnlPct).toFixed(2)}%</td>
                <td className="py-2 text-right">
                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                      onClick={() => openEdit(r)}
                    >Düzenle</button>
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-xs hover:bg-rose-50 text-rose-600"
                      onClick={() => deleteRow(r.id)}
                    >Sil</button>
                  </div>
                </td>
              </tr>
            ))}
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={10} className="py-6 text-center text-gray-500">Kayıt yok.</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t font-semibold">
              <td className="py-2">Toplam</td>
              <td className="py-2 text-right">—</td>
              <td className="py-2 text-right">—</td>
              <td className="py-2 text-right">—</td>
              <td className="py-2 text-right">{fmtCurrency(totals.marketValue, currency)}</td>
              <td className="py-2 text-right">{fmtPercent(100)}</td>
              <td className="py-2 text-right">{fmtCurrency(totals.bookValue, currency)}</td>
              <td className={`py-2 text-right ${totals.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtCurrency(totals.pnl, currency)}</td>
              <td className={`py-2 text-right ${totalsPnlPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtPercent(totalsPnlPct)}</td>
              <td className="py-2 text-right">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-lg">
            <div className="mb-3 text-sm font-medium">{editing.symbol} düzenle</div>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="text-gray-600">Adet</span>
                <input
                  type="number"
                  step="any"
                  value={form.quantity}
                  onChange={(e) => onFormChange("quantity", e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">Ortalama Maliyet</span>
                <input
                  type="number"
                  step="any"
                  value={form.avgCost}
                  onChange={(e) => onFormChange("avgCost", e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                />
              </label>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" onClick={closeEdit} className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50">Vazgeç</button>
              <button type="button" onClick={saveEdit} className="rounded border px-3 py-1.5 text-sm hover:bg-emerald-50 text-emerald-700">Kaydet</button>
            </div>
          </div>
        </div>
      )}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-lg">
            <div className="mb-3 text-sm font-medium">Yeni Holding Ekle</div>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="text-gray-600">Sembol</span>
                <input
                  placeholder="BTCUSDT, XAUUSD, AAPL..."
                  value={createForm.symbol}
                  onChange={(e) => onCreateChange("symbol", e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">Varlık Tipi</span>
                <select
                  value={createForm.assetType}
                  onChange={(e) => {
                    setAssetTypeTouched(true);
                    onCreateChange("assetType", e.target.value);
                  }}
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                >
                  <option value="crypto">Kripto</option>
                  <option value="equity">Hisse</option>
                  <option value="gold">Altın/Metal</option>
                  <option value="fx">Döviz</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">Para Birimi</span>
                <input
                  placeholder="TRY / USD / EUR"
                  value={createForm.currency}
                  onChange={(e) => onCreateChange("currency", e.target.value.toUpperCase())}
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">Adet</span>
                <input
                  type="number"
                  step="any"
                  value={createForm.quantity}
                  onChange={(e) => onCreateChange("quantity", e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">Ortalama Maliyet</span>
                <input
                  type="number"
                  step="any"
                  value={createForm.avgCost}
                  onChange={(e) => onCreateChange("avgCost", e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                />
              </label>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" onClick={closeCreate} className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50">Vazgeç</button>
              <button type="button" onClick={saveCreate} className="rounded border px-3 py-1.5 text-sm hover:bg-emerald-50 text-emerald-700">Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}