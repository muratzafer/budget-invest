"use client";

import { useEffect, useMemo, useState } from "react";


type CategorySlim = { id: string; name: string };

type Suggestion = {
    merchant?: string | null;
    descriptionSnippet?: string | null;
    pattern?: string | null;
    isRegex?: boolean;
    suggestedCategoryId?: string | null;
    categoryId?: string | null; // tolerate either key
    confidence?: number | null;
    count?: number | null;
  };
  
  /**
   * Basit "Önerilen Kurallar" bileşeni
   * /api/rules/suggestions endpoint'inden önerileri çeker ve tek tıkla kural oluşturur.
   */
  export default function RulesSuggestions({ categories }: { categories: CategorySlim[] }) {
    const [items, setItems] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
  
    const catMap = useMemo(() => {
      const m = new Map<string, string>();
      for (const c of categories) m.set(c.id, c.name);
      return m;
    }, [categories]);
  
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/rules/suggestions", { cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as Suggestion[];
        setItems(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setError(e?.message ?? "Öneriler alınamadı.");
      } finally {
        setLoading(false);
      }
    }
  
    useEffect(() => {
      load();
    }, []);
  
    async function createRule(s: Suggestion) {
      const categoryId = s.suggestedCategoryId ?? s.categoryId ?? null;
      const pattern =
        s.merchant ?? s.descriptionSnippet ?? s.pattern ?? ""; // en uygun alanı kullan
      if (!pattern || !categoryId) {
        alert("Gerekli bilgiler eksik (pattern/category).");
        return;
      }
  
      const body = {
        pattern,
        isRegex: Boolean(s.isRegex),
        merchantOnly: true,
        priority: 10,
        categoryId,
      };
  
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
  
      if (res.ok) {
        await load();
        alert("Kural eklendi.");
      } else {
        const msg = await res.text().catch(() => "");
        alert(`Kural eklenemedi. ${msg}`);
      }
    }
  
    return (
        <div className="rounded-2xl border p-4 shadow-sm">
        <div className="mb-2 font-medium">Önerilen Kurallar</div>
        {loading && <div className="text-sm text-gray-500">Yükleniyor…</div>}
        {error && <div className="text-sm text-rose-600">{error}</div>}
        {!loading && !error && items.length === 0 && (
        <div className="text-sm text-gray-500">Şimdilik öneri yok.</div>
      )}

      {!loading && !error && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((s, i) => {
            const catId = s.suggestedCategoryId ?? s.categoryId ?? "";
            const catName = catMap.get(catId) ?? "(Bilinmeyen)";
            const label =
              s.merchant ?? s.descriptionSnippet ?? s.pattern ?? "(desen yok)";
            return (
              <li
                key={`${label}-${catId}-${i}`}
                className="flex items-center justify-between gap-3 border-t pt-2 first:border-0 first:pt-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm">
                    <span className="font-mono">{label}</span>{" "}
                    <span className="text-gray-500">→ {catName}</span>
                    {typeof s.confidence === "number" && (
                      <span className="ml-2 text-xs text-gray-400">
                        %{Math.round(s.confidence * 100)}
                      </span>
                    )}
                    {s.count ? (
                      <span className="ml-2 text-xs text-gray-400">
                        ({s.count})
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  onClick={() => createRule(s)}
                  className="shrink-0 rounded border px-2 py-1 text-sm hover:bg-gray-50"
                >
                  Kurala çevir
                </button>
              </li>
            );
          })}
        </ul>
      )}
      </div>
    )
    }