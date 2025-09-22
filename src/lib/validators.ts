import { z } from "zod";

export const CategoryCreateSchema = z.object({
  name: z.string().min(1, "Kategori adı zorunlu"),
  type: z.enum(["income", "expense"]),
  parentId: z.string().optional().nullable(),
});

export type CategoryCreateInput = z.infer<typeof CategoryCreateSchema>;

export const TransactionCreateSchema = z.object({
  accountId: z.string().min(1),
  categoryId: z.string().optional().nullable(),
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.coerce.number().positive("Tutar pozitif olmalı"),
  currency: z.string().min(1),
  description: z.string().optional().nullable(),
  merchant: z.string().optional().nullable(),
  occurredAt: z.coerce.date(), // string gelirse Date'e çevirir
});

export type TransactionCreateInput = z.infer<typeof TransactionCreateSchema>;
