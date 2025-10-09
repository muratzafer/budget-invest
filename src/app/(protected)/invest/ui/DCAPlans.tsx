"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import DCAPlansTable, { DCAPlan, TargetSlice } from "./DCAPlansTable";

export default function DCAPlans({
  currency = "TRY",
  actualWeights = {},
}: {
  currency?: "TRY" | "USD" | "EUR";
  actualWeights?: Record<string, number>;
}) {
  const [plans, setPlans] = useState<DCAPlan[]>([]);
  const [targets, setTargets] = useState<TargetSlice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // fetch plans + targets
      const [r1, r2] = await Promise.all([
        fetch("/api/dca", { cache: "no-store" }),
        fetch("/api/targets", { cache: "no-store" }),
      ]);
      const [pData, tData] = await Promise.all([r1.json(), r2.json()]);
      if (!r1.ok) throw new Error(pData?.error || "Planlar yüklenemedi");
      if (!r2.ok) throw new Error(tData?.error || "Hedefler yüklenemedi");

      const rows: DCAPlan[] = Array.isArray(pData)
        ? pData.map((r: any) => ({
            id: String(r.id),
            name: String(r.name),
            symbol: String(r.symbol),
            amount: Number(r.amount),
            period: String(r.period) as any,
            status: String(r.status) as any,
            lastRunAt: r.lastRunAt ? new Date(r.lastRunAt).toISOString() : null,
            nextRunAt: r.nextRunAt ? new Date(r.nextRunAt).toISOString() : null,
          }))
        : [];

      const trg: TargetSlice[] = Array.isArray(tData)
        ? tData.map((x: any) => ({
            symbol: String(x.symbol),
            targetPct: Number(x.targetPct),
          }))
        : [];

      setPlans(rows);
      setTargets(trg);
      setVersion((v) => v + 1);
    } catch (e: any) {
      setError(e?.message || "Yükleme başarısız");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onCreate(p: Omit<DCAPlan, "id">) {
    try {
      setSaving(true);
      const res = await fetch("/api/dca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Plan eklenemedi");
      await load();
    } catch (e: any) {
      setError(e?.message || "Plan eklenemedi");
    } finally {
      setSaving(false);
    }
  }

  async function onUpdate(p: DCAPlan) {
    try {
      setSaving(true);
      const res = await fetch("/api/dca", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Plan güncellenemedi");
      await load();
    } catch (e: any) {
      setError(e?.message || "Plan güncellenemedi");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    try {
      setSaving(true);
      const res = await fetch(`/api/dca?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Plan silinemedi");
      await load();
    } catch (e: any) {
      setError(e?.message || "Plan silinemedi");
    } finally {
      setSaving(false);
    }
  }

  const monthlyBudget = useMemo(() => {
    const active = plans.filter((p) => p.status === "active");
    return active.reduce(
      (acc, p) =>
        acc +
        (p.period === "daily"
          ? p.amount * 30
          : p.period === "weekly"
          ? p.amount * 4
          : p.amount),
      0
    );
  }, [plans]);

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-medium">DCA Planları</div>
        <div className="text-xs text-gray-500">
          Aylık tahmini bütçe:{" "}
          {new Intl.NumberFormat("tr-TR", {
            style: "currency",
            currency,
          }).format(monthlyBudget)}
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500">
          Yükleniyor…
        </div>
      ) : (
        <DCAPlansTable
          key={version}
          currency={currency}
          plans={plans}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onDelete={onDelete}
          targets={targets}
          actualWeights={actualWeights}
        />
      )}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={load}
          disabled={loading || saving}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Yenile
        </button>
      </div>
    </div>
  );
}