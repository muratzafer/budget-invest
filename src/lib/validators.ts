import { z } from "zod";

// Basic utility schemas
export const uuidSchema = z.string().uuid();
export const currencySchema = z.string().length(3, "Currency must be a 3-letter ISO code");
export const dateSchema = z.coerce.date();

// Account validator
export const accountValidator = z.object({
  id: uuidSchema.optional(),
  name: z.string().min(1, "Account name is required"),
  type: z.enum(["cash", "bank", "credit"]),
  currency: currencySchema,
  createdAt: dateSchema.optional(),
});

// Category validator
export const categoryValidator = z.object({
  id: uuidSchema.optional(),
  name: z.string().min(1, "Category name is required"),
  type: z.enum(["income", "expense"]),
  parentId: uuidSchema.optional().nullable(),
  createdAt: dateSchema.optional(),
});

// Transaction validator
export const transactionValidator = z.object({
  id: uuidSchema.optional(),
  accountId: uuidSchema,
  categoryId: uuidSchema.optional().nullable(),
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.number().positive("Amount must be greater than 0"),
  currency: currencySchema,
  fxRateToTRY: z.number().positive().optional(),
  description: z.string().optional().nullable(),
  merchant: z.string().optional().nullable(),
  occurredAt: dateSchema,
  createdAt: dateSchema.optional(),
});

// Transaction create validator (for incoming API requests)
export const TransactionCreateSchema = z.object({
  accountId: uuidSchema,
  categoryId: uuidSchema.optional().nullable(),
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.number().positive("Amount must be greater than 0"),
  currency: currencySchema,
  fxRateToTRY: z.number().positive().optional(),
  description: z.string().optional().nullable(),
  merchant: z.string().optional().nullable(),
  occurredAt: dateSchema,
});

// Recurring template validator
export const recurringTemplateValidator = z.object({
  id: uuidSchema.optional(),
  type: z.enum(["income", "expense"]),
  accountId: uuidSchema,
  categoryId: uuidSchema.optional().nullable(),
  amount: z.number().positive(),
  currency: currencySchema,
  description: z.string().optional().nullable(),
  merchant: z.string().optional().nullable(),
  interval: z.enum(["daily", "weekly", "monthly", "yearly"]),
  dayOfMonth: z.number().min(1).max(31).optional().nullable(),
  weekday: z.number().min(0).max(6).optional().nullable(), // 0=Sunday
  everyNDays: z.number().min(1).optional().nullable(),
  nextRunAt: dateSchema,
  isActive: z.boolean().default(true),
});

export type AccountInput = z.infer<typeof accountValidator>;
export type CategoryInput = z.infer<typeof categoryValidator>;
export type TransactionInput = z.infer<typeof transactionValidator>;
export type RecurringTemplateInput = z.infer<typeof recurringTemplateValidator>;