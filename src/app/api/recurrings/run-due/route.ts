import { NextResponse } from "next/server";
import { runDueRecurrings } from "@/lib/recurring";

export const runtime = "nodejs";

function formatDate(date: Date | string | number | null | undefined) {
  if (date == null) return null;
  const d = new Date(date as any);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function POST() {
  try {
    const result = await runDueRecurrings(new Date());

    const list: any[] = Array.isArray(result)
      ? result
      : Array.isArray((result as any)?.items)
        ? (result as any).items
        : Array.isArray((result as any)?.details)
          ? (result as any).details
          : Array.isArray((result as any)?.created)
            ? (result as any).created
            : [];

    const transformed = list.map((item: any) => ({
      ...item,
      createdAt: "createdAt" in item ? formatDate((item as any).createdAt) : undefined,
      nextRunAt: "nextRunAt" in item ? formatDate((item as any).nextRunAt) : undefined,
      lastRunAt: "lastRunAt" in item ? formatDate((item as any).lastRunAt) : undefined,
      occurredAt: "occurredAt" in item ? formatDate((item as any).occurredAt) : undefined,
    }));

    return NextResponse.json({ created: transformed.length, details: transformed });
  } catch (err: any) {
    console.error("[recurrings/run-due][POST]", err);
    return NextResponse.json({ error: "Çalıştırma başarısız" }, { status: 500 });
  }
}