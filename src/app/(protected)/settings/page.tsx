import { prisma } from "@/lib/db";
import CategoryManager from "./ui/CategoryManager";
import RulesManager from "./RulesManager";
import RecurringsManager from "./RecurringsManager";
import RulesSuggestions from "./RulesSuggestions";

export default async function Page() {
  const categories = (await prisma.category.findMany({ orderBy: { name: "asc" } })).map((category: { type: string; }) => ({...category,type: category.type as "income" | "expense",}))
  const categoriesSlim = categories.map((c: { id: any; name: any; }) => ({ id: c.id, name: c.name }));

  const accounts = await prisma.account.findMany({ orderBy: { name: "asc" } });
  const accountsSlim = accounts.map((a: { id: any; name: any; }) => ({ id: a.id, name: a.name }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Kategoriler</h2>
        <CategoryManager initialCategories={categories} />
        <RulesManager categories={categoriesSlim} />
        <RulesSuggestions categories={categoriesSlim} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Yinelenen İşlemler (Basit Yönetici)</h2>
        <RecurringsManager />
      </section>
    </div>
  );
}