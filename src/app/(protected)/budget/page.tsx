import { getServerSession } from "next-auth";
import { authOptions } from "../../api/auth/[...nextauth]/route";
import { prisma } from "@/lib/db";
import TransactionPanel from "./ui/TransactionPanel";

export default async function Page() {
  const session = await getServerSession(authOptions);

  const [accounts, categories, txs] = await Promise.all([
    prisma.account.findMany({ orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.transaction.findMany({
      include: { account: true, category: true },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
  ]);

  // type narrowing for client
  const categoriesNarrow = categories.map((c) => ({ ...c, type: c.type as "income" | "expense" }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Budget</h1>
      <p>Merhaba {session?.user?.email}</p>

      <TransactionPanel accounts={accounts} categories={categoriesNarrow} initialTx={txs as any} />
    </div>
  );
}