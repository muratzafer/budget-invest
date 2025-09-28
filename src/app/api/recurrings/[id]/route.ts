import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Prisma Node runtime gerektirir
export const runtime = "nodejs";

const ALLOWED_KEYS = new Set([
  "isActive",
  "nextRunAt",
  "interval",
  "dayOfMonth",
  "weekday",
  "everyNDays",
  "description",
  "merchant",
  "amount",
  "currency",
  "categoryId",
  "accountId",
  "type",
]);

function sanitizePatch(body: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (v === undefined) continue;

    if (k === "amount") {
      const n = Number(v);
      if (Number.isFinite(n)) out.amount = n;
      continue;
    }
    if (k === "dayOfMonth" || k === "weekday" || k === "everyNDays") {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
      continue;
    }
    if (k === "nextRunAt") {
      const d = new Date(v);
      if (!isNaN(d.getTime())) out.nextRunAt = d;
      continue;
    }

    out[k] = v === null ? null : String(v);
  }
  return out;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const raw = await req.json().catch(() => ({}));
    const data = sanitizePatch(raw);
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Güncellenecek alan bulunamadı" }, { status: 400 });
    }

    const updated = await prisma.recurringTemplate.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    console.error("[recurrings/:id][PATCH]", err);
    return NextResponse.json({ error: "Güncelleme başarısız" }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.recurringTemplate.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[recurrings/:id][DELETE]", err);
    return NextResponse.json({ error: "Silme başarısız" }, { status: 500 });
  }
}