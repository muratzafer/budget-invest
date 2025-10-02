import { prisma } from "@/lib/db";
import CategoryManager from "./ui/CategoryManager";
import RulesManager from "./RulesManager";
import RecurringsManager from "./RecurringsManager";
import RulesSuggestions from "./RulesSuggestions";

export default async function Page() {
  // Fetch in parallel for speed
  const [categoriesRaw, accountsRaw] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.account.findMany({ orderBy: { name: "asc" } }),
  ]);

  // Ensure serializable props and stricter typing for client components
  const categories = categoriesRaw.map((category: { type: string; }) => ({
    ...category,
    type: category.type as "income" | "expense",
  }));

  const categoriesSlim = categories.map((c: { id: any; name: any; }) => ({ id: c.id, name: c.name }));
  const accountsSlim = accountsRaw.map((a: { id: any; name: any; }) => ({ id: a.id, name: a.name }));

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Ayarlar</h1>
        <p className="text-sm text-muted-foreground">
          Kategorileri yönetin, otomatik kural önerilerini gözden geçirin ve yinelenen işlemleri planlayın.
        </p>
      </header>

      {/* Kategoriler & Kurallar */}
      <section className="rounded-2xl border p-5 space-y-6">
        <div className="space-y-1">
          <h2 className="text-lg font-medium">Kategoriler</h2>
          <p className="text-sm text-muted-foreground">
            Yeni kategori ekleyin, mevcutları düzenleyin ve alt/üst ilişkilerini yönetin.
          </p>
        </div>

        <CategoryManager initialCategories={categories} />

        <div className="space-y-4 pt-4 border-t">
          <h3 className="text-base font-medium">Kurallar</h3>
          <RulesManager categories={categoriesSlim} />
          <div className="rounded-xl border p-4">
            <h4 className="font-medium mb-2">Öneriler</h4>
            <p className="text-sm text-muted-foreground mb-3">
              Sık tekrar eden desenlerden üretilen kural önerileri. Tek tıkla kurala dönüştürebilirsiniz.
            </p>
            <RulesSuggestions categories={categoriesSlim} />
          </div>
        </div>
      </section>

      {/* Yinelenen İşlemler */}
      <section className="rounded-2xl border p-5 space-y-3">
        <h2 className="text-lg font-medium">Yinelenen İşlemler</h2>
        <p className="text-sm text-muted-foreground">
          Aylık faturalar, maaş, abonelikler gibi düzenli hareketleri planlayın.
        </p>
        <RecurringsManager />
      </section>
    </div>
  );
}