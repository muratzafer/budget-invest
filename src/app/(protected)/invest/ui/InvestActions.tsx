"use client";
import { useState } from "react";

export default function InvestActions() {
  const [busy, setBusy] = useState<null | "snapshot" | "refresh">(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function takeSnapshot() {
    try {
      setBusy("snapshot");
      setMsg(null);
      const res = await fetch("/api/cron/snapshot", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Snapshot alınamadı (prod'da yetki gerekebilir).");
      setMsg("Snapshot kaydedildi.");
    } catch (e: any) {
      setMsg(e?.message || "Snapshot alınamadı.");
    } finally {
      setBusy(null);
    }
  }

  async function refreshPage() {
    setBusy("refresh");
    try {
      if (typeof window !== "undefined") window.location.reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 flex items-center gap-2">
      <button
        type="button"
        onClick={takeSnapshot}
        disabled={busy !== null}
        className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        title="Portföy snapshot'ı kaydet"
      >
        {busy === "snapshot" ? "Alınıyor…" : "Snapshot al (dev)"}
      </button>
      <button
        type="button"
        onClick={refreshPage}
        disabled={busy !== null}
        className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        title="Sayfayı yenile"
      >
        {busy === "refresh" ? "Yenileniyor…" : "Yenile"}
      </button>
      {msg && <div className="ml-2 text-xs text-gray-600">{msg}</div>}
    </div>
  );
}