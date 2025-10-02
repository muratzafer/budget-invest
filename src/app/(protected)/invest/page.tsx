import prisma from "@/lib/prisma";
import OrderForm from "./ui/OrderForm";

export default async function Page() {
  const accounts = await prisma.account.findMany({
    orderBy: { name: "asc" },
  });
  const accountsSlim = accounts.map((a: { id: any; name: any; }) => ({ id: a.id, name: a.name }));

  return (
    <div>
      <h1 className="text-2xl font-semibold">Invest</h1>
      <p>Burada yatırımlarını takip edebileceksin.</p>

      <section className="rounded-2xl border p-5 space-y-3">
        <h2 className="text-lg font-medium">Yeni Emir</h2>
        <OrderForm accounts={accountsSlim} />
      </section>
    </div>
  );
}