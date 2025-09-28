// ISO string veya Date alır, UTC bazlı DD.MM.YYYY döndürür
export function formatDateUTC(input: string | Date) {
    const d = typeof input === "string" ? new Date(input) : input;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${day}.${m}.${y}`;
}

// Deterministic ISO-like (YYYY-MM-DD) using UTC — good for SSR/CSR equality
export function formatDateISO(input: string | Date) {
  const d = typeof input === "string" ? new Date(input) : input;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`; // 2025-09-24
}

// Locale-aware Turkish format but pinned to UTC to avoid TZ drift
export function formatDateTR(input: string | Date) {
  const d = typeof input === "string" ? new Date(input) : input;
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** YYYY-MM-DD (UTC) — API cevapları için stabil string */
export function formatDateISOFull(d: Date | string | number | null | undefined): string | null {
  if (!d) return null;
  const dt = new Date(d);
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

/** YYYY-MM (UTC) — rapor ay etiketleri için */
export function formatMonthISO(d: Date | string | number): string {
  const dt = new Date(d);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}