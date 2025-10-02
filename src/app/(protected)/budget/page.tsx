import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../api/auth/[...nextauth]/route";
import { prisma } from "@/lib/db";
import TransactionPanel from "./ui/TransactionPanel";
import PasteImport from "./ui/PasteImport";
import { formatDateISO } from "@/lib/format";

// Disable static caching to always fetch fresh data
export const revalidate = 0;
export const dynamic = "force-dynamic";

type AccountDTO = {
  id: string;
  name: string;
  currency: string;
  type: string;
};

type CategoryDTO = {
  id: string;
  name: string;
  type: "income" | "expense";
};

type TxDTO = {
  id: string;
  accountId: string;
  categoryId: string | null;
  type: "income" | "expense" | "transfer";
  amount: number;
  currency: string;
  description: string | null;
  merchant: string | null;
  occurredAt: string; // ISO
  account?: AccountDTO;
  category: CategoryDTO | null;
  categorySource?: "user" | "rule" | "ml";
  suggestedCategoryId: string | null;
  suggestedConfidence: number | null;
};

export default async function Page() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/signin");
  }

  const [accountsRaw, categoriesRaw, txsRaw] = await Promise.all([
    prisma.account.findMany({ orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.transaction.findMany({
      include: { account: true, category: true },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
  ]);

  // Accounts
  const accounts: AccountDTO[] = accountsRaw.map((a: { id: any; name: any; currency: any; type: any; }) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    type: a.type,
  }));

  // Categories
  const categories: CategoryDTO[] = categoriesRaw.map((c: { id: any; name: any; type: string; }) => ({
    id: c.id,
    name: c.name,
    type: c.type as "income" | "expense",
  }));

  // Transactions
  const txs: TxDTO[] = txsRaw.map((t: { id: any; accountId: any; categoryId: any; type: string; amount: any; currency: any; description: any; merchant: any; occurredAt: Date; account: { id: any; name: any; currency: any; type: any; }; category: { id: any; name: any; type: string; }; }) => ({
    id: t.id,
    accountId: t.accountId,
    categoryId: t.categoryId,
    type: t.type as "income" | "expense" | "transfer",
    amount: Number(t.amount), // Prisma.Decimal -> number
    currency: t.currency,
    description: t.description,
    merchant: t.merchant,
    occurredAt: formatDateISO(t.occurredAt as Date),
    account: t.account
      ? {
          id: t.account.id,
          name: t.account.name,
          currency: t.account.currency,
          type: t.account.type,
        }
      : undefined,
    category: t.category
      ? {
          id: t.category.id,
          name: t.category.name,
          type: t.category.type as "income" | "expense",
        }
      : null,
    categorySource: (t as any).categorySource as "user" | "rule" | "ml" | undefined,
    suggestedCategoryId: (t as any).suggestedCategoryId ?? null,
    suggestedConfidence:
      (t as any).suggestedConfidence != null ? Number((t as any).suggestedConfidence) : null,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Budget</h1>
      <p>Merhaba {session?.user?.email}</p>

      <TransactionPanel
        accounts={accounts}
        categories={categories}
        initialTx={txs}
      />

      <div className="pt-6">
        <PasteImport accounts={accounts} categories={categories} />
      </div>
    </div>
  );
}