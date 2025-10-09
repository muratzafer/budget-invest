"use client";
/**
 * DCAPlansTable.tsx
 * Portföy için DCA (Dollar-Cost Averaging) planlarını ve hedef dağılımı gösterir.
 * Sadece UI/Frontend: onCreate/onUpdate/onDelete callback'leriyle üst bileşene haber verir.
 */

import { useEffect, useMemo, useState } from "react";

type Period = "daily" | "weekly" | "monthly";
type Status = "active" | "paused";

export type TargetSlice = {
  symbol: string;      // ör: BTCUSDT, XAUUSD, THYAO.IS
  targetPct: number;   // 0-100
};

export type DCAPlan = {
  id: string;
  name: string;
  symbol: string;      // tek sembollü basit DCA
  amount: number;      // işlem para birimi (TRY varsayılan)
  period: Period;
  status: Status;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
};

export type DCAPlansTableProps = {
  currency?: "TRY" | "USD" | "EUR";
  plans?: DCAPlan[];                 // dışarıdan plan verilebilir, yoksa local state kullanılır
  onCreate?: (p: Omit<DCAPlan, "id">) => void;
  onUpdate?: (p: DCAPlan) => void;
  onDelete?: (id: string) => void;
  // Hedef dağılım kartı için
  targets?: TargetSlice[];
  // (Opsiyon) Gerçekleşen dağılım yüzdeleri (HoldingsTable toplamına göre hesaplayıp geçebilirsin)
  actualWeights?: Record<string, number>; // { "BTCUSDT": 12.34, ... } yüzdelik
};

function fmtCurrency(v: number, ccy: DCAPlansTableProps["currency"]) {
  const val = Number(v ?? 0);
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: ccy ?? "TRY", maximumFractionDigits: 2 }).format(val);
  } catch {
    return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(val)} ${ccy ?? "TRY"}`;
  }
}

function fmtDateTime(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("tr-TR");
}

const PERIOD_LABEL: Record<Period, string> = {
  daily: "Günlük",
  weekly: "Haftalık",
  monthly: "Aylık",
};

const STATUS_LABEL: Record<Status, string> = {
  active: "Aktif",
  paused: "Duraklatıldı",
};

// Basit ID üretici (UI için yeterli)
const uid = () => Math.random().toString(36).slice(2, 10);

export default function DCAPlansTable(props: DCAPlansTableProps) {
  const {
    currency = "TRY",
    onCreate,
    onUpdate,
    onDelete,
    targets = [],
    actualWeights = {},
  } = props;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Dışarıdan gelmiyorsa local mock state kullan (UI demoları için)
  const [localPlans, setLocalPlans] = useState<DCAPlan[]>(() => {
    if (props.plans && props.plans.length > 0) return props.plans;
    return [];
  });

  const plans = props.plans && props.plans.length > 0 ? props.plans : localPlans;

  // Load from backend if plans prop is not provided
  useEffect(() => {
    if (props.plans && props.plans.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/dca", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) {
          const rows: DCAPlan[] = data.map((r: any) => ({
            id: String(r.id),
            name: String(r.name),
            symbol: String(r.symbol),
            amount: Number(r.amount),
            period: (String(r.period) as any) || "monthly",
            status: (String(r.status) as any) || "active",
            lastRunAt: r.lastRunAt ? new Date(r.lastRunAt).toISOString() : null,
            nextRunAt: r.nextRunAt ? new Date(r.nextRunAt).toISOString() : null,
          }));
          setLocalPlans(rows);
        }
      } catch (e: any) {
        if (!cancelled) setMsg({ type: "error", text: "DCA planları yüklenemedi." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.plans?.length]);

  const totals = useMemo(() => {
    const active = plans.filter(p => p.status === "active");
    const m = active.reduce((acc, p) => {
      // Basit dönüştürme: daily→30x, weekly→~4x, monthly→1x
      const factor = p.period === "daily" ? 30 : p.period === "weekly" ? 4 : 1;
      acc.monthly += p.amount * factor;
      return acc;
    }, { monthly: 0 });
    return { monthlyBudget: m.monthly };
  }, [plans]);

  // --------- Modal State ---------
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DCAPlan | null>(null);
  const [form, setForm] = useState<Omit<DCAPlan, "id">>({
    name: "",
    symbol: "",
    amount: 0,
    period: "monthly",
    status: "active",
    lastRunAt: null,
    nextRunAt: null,
  });

  function resetForm() {
    setEditing(null);
    setForm({ name: "", symbol: "", amount: 0, period: "monthly", status: "active", lastRunAt: null, nextRunAt: null });
  }

  async function handleCreate() {
    if (onCreate) {
      onCreate(form);
      setOpen(false);
      resetForm();
      return;
    }
    try {
      setSaving(true);
      const res = await fetch("/api/dca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Plan eklenemedi");
      const saved: DCAPlan = {
        id: String(data.id ?? uid()),
        name: String(data.name ?? form.name),
        symbol: String(data.symbol ?? form.symbol),
        amount: Number(data.amount ?? form.amount),
        period: (String(data.period ?? form.period) as any),
        status: (String(data.status ?? form.status) as any),
        lastRunAt: data.lastRunAt ? new Date(data.lastRunAt).toISOString() : null,
        nextRunAt: data.nextRunAt ? new Date(data.nextRunAt).toISOString() : null,
      };
      setLocalPlans(prev => [saved, ...prev]);
      setMsg({ type: "success", text: "Plan eklendi." });
      setOpen(false);
      resetForm();
    } catch (err: any) {
      setMsg({ type: "error", text: err?.message || "Plan eklenemedi." });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editing) return;
    const payload = { ...editing, ...form };
    if (onUpdate) {
      onUpdate(payload);
      setOpen(false);
      resetForm();
      return;
    }
    try {
      setSaving(true);
      const res = await fetch("/api/dca", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Plan güncellenemedi");
      const saved: DCAPlan = {
        id: String(data.id ?? editing.id),
        name: String(data.name ?? payload.name),
        symbol: String(data.symbol ?? payload.symbol),
        amount: Number(data.amount ?? payload.amount),
        period: (String(data.period ?? payload.period) as any),
        status: (String(data.status ?? payload.status) as any),
        lastRunAt: data.lastRunAt ? new Date(data.lastRunAt).toISOString() : null,
        nextRunAt: data.nextRunAt ? new Date(data.nextRunAt).toISOString() : null,
      };
      setLocalPlans(prev => prev.map(p => (p.id === saved.id ? saved : p)));
      setMsg({ type: "success", text: "Plan güncellendi." });
      setOpen(false);
      resetForm();
    } catch (err: any) {
      setMsg({ type: "error", text: err?.message || "Plan güncellenemedi." });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (onDelete) {
      onDelete(id);
      return;
    }
    try {
      setSaving(true);
      const res = await fetch(`/api/dca?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Plan silinemedi");
      setLocalPlans(prev => prev.filter(p => p.id !== id));
      setMsg({ type: "success", text: "Plan silindi." });
    } catch (err: any) {
      setMsg({ type: "error", text: err?.message || "Plan silinemedi." });
    } finally {
      setSaving(false);
    }
  }

  function startEdit(p: DCAPlan) {
    setEditing(p);
    setForm({
      name: p.name,
      symbol: p.symbol,
      amount: p.amount,
      period: p.period,
      status: p.status,
      lastRunAt: p.lastRunAt ?? null,
      nextRunAt: p.nextRunAt ?? null,
    });
    setOpen(true);
  }

  // Basit hedef dağılım kartı (progress bar)
  const TargetCard = () => {
    if (!targets || targets.length === 0) return null;
    return (
      <div className="rounded-xl border p-4 mb-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-medium">Hedef Dağılım</div>
          <div className="text-sm text-gray-500">Gerçekleşen/ Hedef</div>
        </div>
        <div className="space-y-3">
          {targets.map((t) => {
            const actual = Number(actualWeights[t.symbol] ?? 0);
            const target = Number(t.targetPct ?? 0);
            const width = Math.max(0, Math.min(100, actual));
            return (
              <div key={t.symbol}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-mono">{t.symbol}</span>
                  <span className="text-gray-600">{actual.toFixed(2)}% / {target.toFixed(2)}%</span>
                </div>
                <div className="h-2 w-full rounded bg-gray-100 overflow-hidden mt-1">
                  <div className="h-2 rounded" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3000);
    return () => clearTimeout(t);
  }, [msg]);

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="font-medium">DCA Planları</div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-600">
            Aylık tahmini bütçe: <span className="font-medium">{fmtCurrency(totals.monthlyBudget, currency)}</span>
          </div>
          <button
            type="button"
            onClick={() => { resetForm(); setOpen(true); }}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            + Yeni Plan
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`mb-3 rounded-md px-3 py-2 text-sm ${
            msg.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-rose-50 text-rose-700 border border-rose-200"
          }`}
        >
          {msg.text}
        </div>
      )}

      <TargetCard />

      {loading && (
        <div className="mb-3 text-sm text-gray-500">Planlar yükleniyor…</div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2">Plan Adı</th>
              <th className="py-2">Sembol</th>
              <th className="py-2 text-right">Tutar</th>
              <th className="py-2">Periyot</th>
              <th className="py-2">Durum</th>
              <th className="py-2">Son Çalışma</th>
              <th className="py-2">Sonraki</th>
              <th className="py-2 text-right">Aksiyon</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="py-2">{p.name}</td>
                <td className="py-2 font-mono">{p.symbol}</td>
                <td className="py-2 text-right">{fmtCurrency(p.amount, currency)}</td>
                <td className="py-2">{PERIOD_LABEL[p.period]}</td>
                <td className="py-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${p.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-700"}`}>
                    {STATUS_LABEL[p.status]}
                  </span>
                </td>
                <td className="py-2">{fmtDateTime(p.lastRunAt)}</td>
                <td className="py-2">{fmtDateTime(p.nextRunAt)}</td>
                <td className="py-2 text-right">
                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      className="rounded-md border px-2 py-1 hover:bg-gray-50"
                    >
                      Düzenle
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id)}
                      className="rounded-md border px-2 py-1 hover:bg-rose-50"
                    >
                      Sil
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {plans.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-gray-500">Plan bulunamadı.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-medium">{editing ? "Planı Düzenle" : "Yeni DCA Planı"}</div>
              <button className="text-gray-500 hover:text-gray-800" onClick={() => { setOpen(false); resetForm(); }}>✕</button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <label className="grid gap-1">
                <span className="text-sm text-gray-600">Plan Adı</span>
                <input
                  className="rounded-md border px-3 py-2"
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ör: Aylık BTC Alımı"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span className="text-sm text-gray-600">Sembol</span>
                  <input
                    className="rounded-md border px-3 py-2 font-mono"
                    value={form.symbol}
                    onChange={(e) => setForm(f => ({ ...f, symbol: e.target.value }))}
                    placeholder="BTCUSDT"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm text-gray-600">Tutar ({currency})</span>
                  <input
                    className="rounded-md border px-3 py-2"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm(f => ({ ...f, amount: Number(e.target.value) }))}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span className="text-sm text-gray-600">Periyot</span>
                  <select
                    className="rounded-md border px-3 py-2"
                    value={form.period}
                    onChange={(e) => setForm(f => ({ ...f, period: e.target.value as Period }))}
                  >
                    <option value="daily">Günlük</option>
                    <option value="weekly">Haftalık</option>
                    <option value="monthly">Aylık</option>
                  </select>
                </label>

                <label className="grid gap-1">
                  <span className="text-sm text-gray-600">Durum</span>
                  <select
                    className="rounded-md border px-3 py-2"
                    value={form.status}
                    onChange={(e) => setForm(f => ({ ...f, status: e.target.value as Status }))}
                  >
                    <option value="active">Aktif</option>
                    <option value="paused">Duraklatıldı</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span className="text-sm text-gray-600">Son Çalışma</span>
                  <input
                    className="rounded-md border px-3 py-2"
                    type="datetime-local"
                    value={form.lastRunAt ?? ""}
                    onChange={(e) => setForm(f => ({ ...f, lastRunAt: e.target.value || null }))}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm text-gray-600">Sonraki Çalışma</span>
                  <input
                    className="rounded-md border px-3 py-2"
                    type="datetime-local"
                    value={form.nextRunAt ?? ""}
                    onChange={(e) => setForm(f => ({ ...f, nextRunAt: e.target.value || null }))}
                  />
                </label>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { setOpen(false); resetForm(); }}
                className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
              >
                İptal
              </button>
              {editing ? (
                <button
                  type="button"
                  onClick={handleUpdate}
                  disabled={saving}
                  className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Kaydediliyor…" : "Kaydet"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={saving}
                  className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Ekleniyor…" : "Ekle"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}