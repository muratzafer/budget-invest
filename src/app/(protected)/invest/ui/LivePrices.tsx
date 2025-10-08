"use client";

import { useEffect, useRef } from "react";

/**
 * LivePrices
 *  - Connects to Binance WS and listens ticker updates for given symbols
 *  - Batches inbound ticks and flushes them every `flushMs`
 *  - Optionally POSTs to our API (/api/prices) or falls back to /api/prices/[symbol]
 *  - Emits a window CustomEvent("live-prices", {detail: batch}) for global listeners
 *  - Calls optional `onUpdate(batch)` so parent components can react locally
 *  - Headless component: returns null
 */
export default function LivePrices({
  symbols,
  currency = "USDT",
  flushMs = 1500,
  postToApi = true,
  onUpdate,
  suspendOnHidden = true,
}: {
  symbols: string[];
  currency?: string; // Binance pairs are mostly *USDT — keep as plain string
  flushMs?: number;
  /** If true, POST buffered ticks to our API */
  postToApi?: boolean;
  /** Called at each flush with the latest ticks per symbol */
  onUpdate?: (batch: Record<string, { price: number; asOf: number }>) => void;
  /** When true, pause WS & flushing while the tab is hidden */
  suspendOnHidden?: boolean;
}) {
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const backoffRef = useRef(1500); // ms, exponential backoff base
  const bufferRef = useRef<Record<string, { price: number; asOf: number }>>({});
  const reconnectTimer = useRef<number | null>(null);
  const flusher = useRef<number | null>(null);
  const onUpdateRef = useRef<typeof onUpdate>(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!symbols || symbols.length === 0) return;

    mountedRef.current = true;

    const isHidden = () => suspendOnHidden && typeof document !== "undefined" && document.hidden;

    // Normalize symbols to Binance stream format (lowercase e.g. btcusdt)
    const norm = Array.from(
      new Set(
        symbols
          .filter(Boolean)
          .map((s) => s.replace(/[^a-z0-9]/gi, "").toLowerCase())
      )
    );

    if (norm.length === 0) return;

    const streams = norm.map((s) => `${s}@ticker`).join("/");
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    function connect() {
      if (isHidden()) return; // don't connect while tab hidden
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = 1500; // reset backoff on successful connect
        // console.info("LivePrices connected", url);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse((evt.data as string));
          const d = msg?.data;
          if (!d) return;
          const symbol: string = (d.s || "").toString().toUpperCase();
          const price = Number(d.c ?? d.p ?? d.lastPrice);
          const asOf = Number(d.E ?? Date.now());
          if (!symbol || !Number.isFinite(price)) return;
          bufferRef.current[symbol] = { price, asOf };
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (!mountedRef.current) return;
        // exponential backoff with jitter
        const delay = Math.min(20000, backoffRef.current * (1 + Math.random()));
        backoffRef.current = Math.min(20000, backoffRef.current * 1.6);
        reconnectTimer.current = window.setTimeout(connect, delay) as unknown as number;
      };

      ws.onerror = () => {
        try { ws.close(); } catch {}
      };
    }

    connect();

    const onVis = () => {
      if (!suspendOnHidden) return;
      if (!document.hidden && !wsRef.current) {
        // became visible and no active socket → reconnect and flush soon
        backoffRef.current = 1500;
        connect();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVis);
    }

    // Periodically flush buffered prices
    const flush = async () => {
      const batch = { ...bufferRef.current };
      const items = Object.entries(batch).map(([sym, v]) => ({
        symbol: sym,
        price: v.price,
        currency, // NOTE: not ISO 4217; stored as text (e.g., USDT)
        source: "binance",
        asOf: new Date(v.asOf).toISOString(),
      }));
      if (items.length === 0) return;

      // Clear buffer before posting to avoid growth during network wait
      bufferRef.current = {};

      // Notify local listeners
      try {
        onUpdateRef.current?.(batch);
      } catch {
        // user callback errors should not break the stream
      }

      // Emit a global event for any component wanting to listen
      try {
        window.dispatchEvent(new CustomEvent("live-prices", { detail: batch }));
      } catch {
        // ignore
      }

      if (!postToApi) return;

      try {
        const res = await fetch("/api/prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
          keepalive: true,
        });
        if (!res.ok) {
          // Fallback to per-symbol endpoint if bulk is not supported
          await Promise.all(
            items.map((it) =>
              fetch(`/api/prices/${it.symbol}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(it),
                keepalive: true,
              })
            )
          );
        }
      } catch {
        // Ignore network errors; we'll try again on next flush
      }
    };

    flusher.current = window.setInterval(() => {
      if (isHidden()) return;
      flush();
    }, flushMs) as unknown as number;

    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      if (flusher.current) window.clearInterval(flusher.current);
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
      bufferRef.current = {};
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVis as any);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(symbols), currency, flushMs, postToApi, suspendOnHidden]);

  return null; // headless component
}