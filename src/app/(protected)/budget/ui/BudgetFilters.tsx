"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useEffect } from "react";

export default function BudgetFilters() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const today = useMemo(() => new Date(), []);
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");

  const [month, setMonth] = useState<string>(sp.get("month") || `${yyyy}-${mm}`);

  useEffect(() => {
    // URL değişirse (geri/ileri navigasyonda), input’u güncel tut
    const m = sp.get("month");
    if (m && m !== month) setMonth(m);
  }, [sp]);

  function apply() {
    const p = new URLSearchParams(sp.toString());
    if (month) p.set("month", month);
    router.replace(`${pathname}?${p.toString()}`);
  }

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-end">
      <label className="text-sm">
        Ay (YYYY-MM)
        <input
          className="mt-1 w-full rounded border px-2 py-1 font-mono"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          placeholder="2025-10"
        />
      </label>
      <div>
        <button onClick={apply} className="rounded border px-3 py-2 hover:bg-gray-50">
          Uygula
        </button>
      </div>
    </div>
  );
}