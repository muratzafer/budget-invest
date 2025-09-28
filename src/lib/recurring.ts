import { prisma } from "@/lib/db";

const MIN_RUN_GAP_MS = 60_000; // 1 minute guard to avoid double-runs

function toDate(v: Date | string | null | undefined): Date | null {
  return v ? new Date(v as any) : null;
}

function addDays(d: Date, n: number) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
function addMonths(d: Date, n: number) { const c = new Date(d); c.setMonth(c.getMonth() + n); return c; }

function computeNextRun(now: Date, t: {
  interval: string; dayOfMonth?: number | null; weekday?: number | null; everyNDays?: number | null;
}): Date {
  if (t.interval === "daily") return addDays(now, 1);
  if (t.interval === "weekly") {
    const wd = (t.weekday ?? 1); // default pazartesi
    const diff = (7 + wd - now.getDay()) % 7 || 7;
    return addDays(now, diff);
  }
  if (t.interval === "monthly") {
    const day = Math.min(t.dayOfMonth ?? 1, 28); // güvenli gün
    const next = addMonths(new Date(now.getFullYear(), now.getMonth(), day), 1);
    return next;
  }
  if (t.interval === "custom") return addDays(now, Math.max(t.everyNDays ?? 1, 1));
  // varsayılan: 30 gün
  return addDays(now, 30);
}

export async function runDueRecurrings(now = new Date()) {
  const due = await prisma.recurringTemplate.findMany({
    where: { isActive: true, nextRunAt: { lte: now } },
  });

  const results: {
    createdAt: string | null;
    nextRunAt: string | null;
    lastRunAt: string | null;
    occurredAt: string | null;
    templateId: string;
    transactionId: string;
}[] = [];

  for (const r of due) {
    // Idempotency guard: if it ran very recently, skip
    const last = toDate((r as any).lastRunAt);
    if (last && now.getTime() - last.getTime() < MIN_RUN_GAP_MS) {
      continue;
    }
    const created = await prisma.transaction.create({
      data: {
        type: r.type as any,
        accountId: r.accountId,
        categoryId: r.categoryId ?? null,
        amount: r.amount,
        currency: r.currency,
        description: r.description ?? null,
        merchant: r.merchant ?? null,
        occurredAt: now,
      },
    });

    const nextRunAt = computeNextRun(now, {
      interval: r.interval,
      dayOfMonth: r.dayOfMonth,
      weekday: r.weekday,
      everyNDays: r.everyNDays,
    });

    await prisma.recurringTemplate.update({
      where: { id: r.id },
      data: { lastRunAt: now, nextRunAt },
    });

    results.push({ 
      templateId: r.id, 
      transactionId: created.id, 
      createdAt: (created.createdAt as any)?.toISOString() ?? null, 
      nextRunAt: nextRunAt?.toISOString() ?? null, 
      lastRunAt: now.toISOString(), 
      occurredAt: now.toISOString() 
    });
  }

  return results;
}