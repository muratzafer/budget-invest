

"use client";
import { useMemo, useState } from "react";

export type MonthlySummary = {
  month: string; // ISO year-month like 2025-09
  income: number;
  expense: number;
  net: number; // income - expense
};

export type InsightInputs = {
  currency?: "TRY" | "USD" | "EUR";
  current: MonthlySummary;
  prev?: MonthlySummary | null;
  sixMonth?: MonthlySummary[]; // oldest→newest or newest→oldest; we will sort
  topCategories?: Array<{ name: string; expense: number }>;
  topMerchants?: Array<{ name: string; expense: number }>;
};

function fmtCurrency(v: number, ccy: InsightInputs["currency"]) {
  const val = Number(v ?? 0);
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: ccy ?? "TRY", maximumFractionDigits: 0 }).format(val);
  } catch {
    return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(val)} ${ccy ?? "TRY"}`;
  }
}

function pct(a: number, b: number) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0;
  return (a / b) * 100;
}

function diffPct(a: number, b: number) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0;
  return ((a - b) / Math.abs(b)) * 100;
}

function stddev(nums: number[]) {
  if (!nums.length) return 0;
  const mean = nums.reduce((s, x) => s + x, 0) / nums.length;
  const variance = nums.reduce((s, x) => s + (x - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

export default function InsightsPanel({
  currency = "TRY",
  current,
  prev = null,
  sixMonth = [],
  topCategories = [],
  topMerchants = [],
}: InsightInputs) {
  const [copied, setCopied] = useState(false);

  const ordered = useMemo(() => {
    // normalize order by month ascending
    const arr = [...sixMonth];
    arr.sort((a, b) => a.month.localeCompare(b.month));
    return arr;
  }, [sixMonth]);

  const insights = useMemo(() => {
    const items: string[] = [];

    const savingsRate = pct(current.net, current.income);
    if (Number.isFinite(savingsRate)) {
      items.push(`Tasarruf oranı bu ay **%${savingsRate.toFixed(1)}**.`);
    }

    if (prev) {
      const momIncome = diffPct(current.income, prev.income);
      const momExpense = diffPct(current.expense, prev.expense);
      const momNet = diffPct(current.net, prev.net);
      items.push(
        `Geçen aya göre gelir **%${momIncome.toFixed(1)}**, gider **%${momExpense.toFixed(1)}**, net **%${momNet.toFixed(1)}** değişti.`
      );
    }

    const topCat = [...topCategories].sort((a, b) => b.expense - a.expense)[0];
    if (topCat) {
      const catShare = pct(topCat.expense, current.expense);
      items.push(`En yüksek harcama **${topCat.name}** (toplam giderin **%${catShare.toFixed(1)}**).`);
    }

    const topMer = [...topMerchants].sort((a, b) => b.expense - a.expense)[0];
    if (topMer) {
      const merShare = pct(topMer.expense, current.expense);
      items.push(`En çok ödeme yapılan işletme **${topMer.name}** (giderin **%${merShare.toFixed(1)}**).`);
    }

    if (ordered.length >= 3) {
      const nets = ordered.map((m) => m.net);
      const vol = stddev(nets);
      const mean = nets.reduce((s, x) => s + x, 0) / nets.length;
      if (Number.isFinite(vol) && Number.isFinite(mean)) {
        const volPct = pct(vol, Math.abs(mean));
        items.push(`Son ${ordered.length} ayda net akış volatilitesi ~**%${(volPct || 0).toFixed(0)}** (std/ortalama).`);
      }

      // trend yönü (son 3 ay ortalaması vs önceki 3 ay)
      const half = Math.floor(ordered.length / 2);
      const firstAvg = ordered.slice(0, half).reduce((s, x) => s + x.net, 0) / Math.max(1, half);
      const lastAvg = ordered.slice(half).reduce((s, x) => s + x.net, 0) / Math.max(1, ordered.length - half);
      const trend = diffPct(lastAvg, firstAvg);
      if (Number.isFinite(trend)) {
        items.push(`Net akış trendi **%${trend.toFixed(0)}** yönünde.`);
      }

      // 3 ay ileriye kaba projeksiyon
      const runRate = lastAvg;
      items.push(`3 aylık koşu hızı ~**${fmtCurrency(runRate * 3, currency)}** (son trend ile).`);
    }

    // Uyarılar
    if (current.expense > current.income) {
      items.push("Uyarı: Bu ay gider gelirden yüksek. Bütçe ayarlaması gerekebilir.");
    }

    return items;
  }, [current, prev, topCategories, topMerchants, ordered, currency]);

  const mdText = useMemo(() => {
    const lines = [
      `# Aylık Özet — ${current.month}`,
      "",
      `• Gelir: ${fmtCurrency(current.income, currency)}`,
      `• Gider: ${fmtCurrency(current.expense, currency)}`,
      `• Net: ${fmtCurrency(current.net, currency)}`,
      "",
      "## İçgörüler",
      ...insights.map((s) => `- ${s}`),
    ];
    return lines.join("\n");
  }, [insights, current, currency]);

  function downloadMd() {
    const blob = new Blob([mdText], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapor_${current.month}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function copyMd() {
    try {
      await navigator.clipboard.writeText(mdText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-medium">AI Insights (kural tabanlı)</div>
        <div className="flex items-center gap-2 text-xs">
          <button onClick={copyMd} className="rounded border px-2 py-1 hover:bg-gray-50">Kopyala</button>
          <button onClick={downloadMd} className="rounded border px-2 py-1 hover:bg-gray-50">Markdown indir</button>
          {copied && <span className="text-emerald-600">Kopyalandı</span>}
        </div>
      </div>

      <div className="space-y-2 text-sm leading-relaxed">
        {insights.map((s, i) => (
          <div key={i} className="">• {s}</div>
        ))}
        {insights.length === 0 && (
          <div className="text-gray-500">İçgörü üretmek için yeterli veri yok.</div>
        )}
      </div>
    </div>
  );
}