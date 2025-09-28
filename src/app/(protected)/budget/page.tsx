import { getServerSession } from "next-auth";
import { authOptions } from "../../api/auth/[...nextauth]/route";
import { prisma } from "@/lib/db";
import TransactionPanel from "./ui/TransactionPanel";
import PasteImport from "./ui/PasteImport";
import { formatDateUTC, formatDateISO, formatDateTR } from "@/lib/format";


export default async function Page() {
  const session = await getServerSession(authOptions);

  const [accountsRaw, categoriesRaw, txsRaw] = await Promise.all([
    prisma.account.findMany({ orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.transaction.findMany({
      include: { account: true, category: true },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
  ]);

  // Accounts: yalın kopya
  const accounts = accountsRaw.map((a: { id: any; name: any; currency: any; type: any; }) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    type: a.type,
  }));

  // Categories: type daralt + yalın kopya
  const categories = categoriesRaw.map((c: { id: any; name: any; type: string; }) => ({
    id: c.id,
    name: c.name,
    type: c.type as "income" | "expense",
  }));

  // Transactions: Decimal -> number, Date -> ISO string, ilişkileri de sadeleştir
  const txs = txsRaw.map((t: { id: any; accountId: any; categoryId: any; type: string; amount: any; currency: any; description: any; merchant: any; occurredAt: { toISOString: () => any; }; account: { id: any; name: any; currency: any; type: any; }; category: { id: any; name: any; type: string; } | null; categorySource: string; suggestedCategoryId: any; suggestedConfidence: any; }) => ({
    id: t.id,
    accountId: t.accountId,
    categoryId: t.categoryId,
    type: t.type as "income" | "expense" | "transfer",
    amount: Number(t.amount),                       // Decimal -> number
    currency: t.currency,
    description: t.description,
    merchant: t.merchant,
    occurredAt: formatDateISO(new Date(t.occurredAt.toISOString())),
    account: t.account
      ? { id: t.account.id, name: t.account.name, currency: t.account.currency, type: t.account.type }
      : undefined,
    category: t.category
      ? { id: t.category.id, name: t.category.name, type: t.category.type as "income" | "expense" }
      : null,
    categorySource: t.categorySource as "user" | "rule" | "ml" | undefined,
    suggestedCategoryId: t.suggestedCategoryId ?? null,
    suggestedConfidence: t.suggestedConfidence != null ? Number(t.suggestedConfidence) : null,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Budget</h1>
      <p>Merhaba {session?.user?.email}</p>

      <TransactionPanel
      accounts={structuredClone(accounts)}
      categories={structuredClone(categories)}
      initialTx={structuredClone(txs)}
    />

    <div className="pt-6">
    <PasteImport
        accounts={structuredClone(accounts)}
        categories={structuredClone(categories)}
      />
    </div>
    </div>
  );
}