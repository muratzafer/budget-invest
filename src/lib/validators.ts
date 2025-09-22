import { z } from "zod";

export const CategoryCreateSchema = z.object({
  name: z.string().min(1, "Kategori adı zorunlu"),
  type: z.enum(["income", "expense"]),
  parentId: z.string().optional().nullable(),
});

export type CategoryCreateInput = z.infer<typeof CategoryCreateSchema>;