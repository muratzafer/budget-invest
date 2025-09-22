import { prisma } from "@/lib/db";
import CategoryManager from "./ui/CategoryManager";

export default async function Page() {
  const categories = (await prisma.category.findMany({ orderBy: { name: "asc" } })).map(category => ({
    ...category,
    type: category.type as "income" | "expense",
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Kategoriler</h2>
        <CategoryManager initialCategories={categories} />
      </section>
    </div>
  );
}