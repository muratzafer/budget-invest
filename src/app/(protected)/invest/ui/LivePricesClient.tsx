"use client";

import { useEffect, useRef } from "react";

type LivePrice = { symbol: string; price: number; ts?: number };

export type LivePricesClientProps = {
  /**
   * Symbols to watch. Case-insensitive, but try to pass the same
   * symbols that your server API expects, e.g. ["BTCUSDT","XAUUSD","AAPL"].
   */
  symbols: string[];
  /** Optional callback for each successful fetch tick. */
  onTick?: (prices: LivePrice[]) => void;
  /** Polling period in ms. Default: 4000 */
  intervalMs?: number;
  /** Persist fetched prices to DB (via /api/prices?persist=1) */
  persist?: boolean;
};

/**
 * Client-side poller that fetches `/api/prices?symbols=...` periodically and
 * broadcasts updates via a `CustomEvent` and a shared `window.__livePrices` Map.
 *
 * Improvements over the previous version:
 *  - Cancels in-flight requests on unmount / symbol changes (AbortController)
 *  - Prevents overlapping requests (inFlight flag)
 *  - Visibility-aware: pauses when the tab is hidden, resumes on focus
 *  - Exponential backoff on transient errors (up to 30s)
 *  - Emits update event only when something actually changed
 */
export default function LivePricesClient({
  symbols,
  onTick,
  intervalMs = 4000,
  persist = false,
}: LivePricesClientProps) {
  const controllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const stoppedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const backoffRef = useRef(0); // 0 => use intervalMs, otherwise ms backoff
  const lastKeysRef = useRef<string>("");

  useEffect(() => {
    if (!symbols?.length) return;

    // Normalize and de-dupe keys (upper-case)
    const watch = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).sort();
    const key = watch.join(",");

    // If keys didn't change, keep running
    if (lastKeysRef.current === key && timerRef.current) {
      return;
    }
    lastKeysRef.current = key;

    // Ensure shared store
    if (typeof window !== "undefined") {
      (window as any).__livePrices ??= new Map<string, number>();
    }

    // Cleanup any previous loop
    stoppedRef.current = true;
    if (controllerRef.current) controllerRef.current.abort();
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    stoppedRef.current = false;
    backoffRef.current = 0;

    async function fetchOnce(signal: AbortSignal) {
      if (inFlightRef.current) return; // avoid overlap
      inFlightRef.current = true;
      try {
        const params = new URLSearchParams({
          mode: "live",
          symbols: key,             // comma-separated; server splits
        });
        if (persist) params.set("persist", "1");
        const res = await fetch(`/api/prices?${params.toString()}`, { cache: "no-store", signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Array<{ symbol: string; price: number; asOf?: string }>;

        // Update store and detect changes
        const store: Map<string, number> = (window as any).__livePrices;
        let changed = false;
        for (const row of data) {
          if (!row?.symbol) continue;
          const sym = row.symbol.toUpperCase();
          const p = Number(row.price);
          if (!Number.isFinite(p)) continue;
          if (store.get(sym) !== p) {
            store.set(sym, p);
            changed = true;
          }
        }

        if (changed) {
          const mapEvent = new CustomEvent<Map<string, number>>("prices:update", {
            detail: (window as any).__livePrices,
          });
          window.dispatchEvent(mapEvent);
          // Legacy event (array payload) for older listeners such as HoldingsTable
          const arrEvent = new CustomEvent("live-prices", { detail: data });
          window.dispatchEvent(arrEvent);
        }

        onTick?.(data.map((d) => ({ symbol: d.symbol.toUpperCase(), price: Number(d.price), ts: Date.now() })));
        backoffRef.current = 0; // success → reset backoff
      } catch (err: any) {
        if (err?.name !== "AbortError" && process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn("[LivePricesClient] fetch error:", err);
        }
        // On error, increase backoff (1x, 2x, 4x ... up to 30s)
        backoffRef.current = backoffRef.current
          ? Math.min(backoffRef.current * 2, 30000)
          : Math.max(intervalMs, 2000);
      } finally {
        inFlightRef.current = false;
      }
    }

    function scheduleNext() {
      if (stoppedRef.current) return;
      const delay = backoffRef.current || intervalMs;
      timerRef.current = window.setTimeout(async () => {
        controllerRef.current?.abort();
        controllerRef.current = new AbortController();
        await fetchOnce(controllerRef.current.signal);
        scheduleNext();
      }, delay);
    }

    // Visibility handling: pause when hidden, resume when visible
    function onVisibility() {
      const hidden = document.hidden;
      if (hidden) {
        // pause
        stoppedRef.current = true;
        if (controllerRef.current) controllerRef.current.abort();
        if (timerRef.current) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      } else {
        // resume
        if (!stoppedRef.current) return; // already running
        stoppedRef.current = false;
        backoffRef.current = 0;
        scheduleNext();
      }
    }

    document.addEventListener("visibilitychange", onVisibility);

    // Kick off the loop immediately
    controllerRef.current = new AbortController();
    fetchOnce(controllerRef.current.signal).finally(scheduleNext);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stoppedRef.current = true;
      if (controllerRef.current) controllerRef.current.abort();
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [symbols?.join(","), intervalMs, onTick, persist]);

  return null; // headless helper
}

// Optional helper to read the latest price safely.
export function getLivePrice(symbol: string): number | undefined {
  if (typeof window === "undefined") return undefined;
  const m: Map<string, number> | undefined = (window as any).__livePrices;
  return m?.get(symbol.toUpperCase());
}

// Augment Window type for TS ergonomics (not required at runtime)
declare global {
  interface Window {
    __livePrices?: Map<string, number>;
  }
}
