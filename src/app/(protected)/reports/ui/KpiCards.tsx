

"use client";

import React from "react";

type Props = {
  totalIncomeValue: number;
  totalExpenseValue: number;
  netValue: number;
  transactionCount: number;
  currency?: string; // e.g. "TRY", "USD" – defaults to TRY
};

function fmtCurrency(value: number, currency = "TRY") {
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    // Fallback in case provided currency code is not supported on the host
    return new Intl.NumberFormat("tr-TR", {
      maximumFractionDigits: 0,
    }).format(value) + ` ${currency}`;
  }
}

function StatCard({
  label,
  value,
  sub,
  intent = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  intent?: "default" | "positive" | "negative";
}) {
  const ring =
    intent === "positive"
      ? "ring-emerald-500/30"
      : intent === "negative"
      ? "ring-rose-500/30"
      : "ring-gray-300/30 dark:ring-white/10";

  const text =
    intent === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : intent === "negative"
      ? "text-rose-600 dark:text-rose-400"
      : "text-gray-900 dark:text-gray-100";

  return (
    <div className={`rounded-2xl border bg-white/50 p-4 shadow-sm ring-1 ${ring} dark:bg-neutral-900/60 dark:border-neutral-800`}>
      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${text}`}>{value}</div>
      {sub ? (
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</div>
      ) : null}
    </div>
  );
}

export default function KpiCards({
  totalIncomeValue,
  totalExpenseValue,
  netValue,
  transactionCount,
  currency = "TRY",
}: Props) {
  const netIntent = netValue > 0 ? "positive" : netValue < 0 ? "negative" : "default";

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Toplam Gelir"
        value={fmtCurrency(totalIncomeValue, currency)}
        intent="positive"
      />
      <StatCard
        label="Toplam Gider"
        value={fmtCurrency(totalExpenseValue, currency)}
        intent="negative"
      />
      <StatCard
        label="Net"
        value={fmtCurrency(netValue, currency)}
        intent={netIntent}
      />
      <StatCard
        label="İşlem Sayısı"
        value={new Intl.NumberFormat("tr-TR").format(transactionCount)}
        sub="Seçilen aralıkta"
      />
    </section>
  );
}