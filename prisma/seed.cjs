const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function ensureAccount(a) {
  const found = await prisma.account.findFirst({
    where: { name: a.name, type: a.type, currency: a.currency },
    select: { id: true },
  });
  if (!found) {
    await prisma.account.create({ data: a });
  }
}

async function ensureCategory(c) {
  const found = await prisma.category.findFirst({
    where: { name: c.name, type: c.type },
    select: { id: true },
  });
  if (!found) {
    await prisma.category.create({ data: c });
  }
}

async function main() {
  // Accounts (idempotent)
  await ensureAccount({ name: "Nakit", type: "cash", currency: "TRY" });
  await ensureAccount({ name: "Banka", type: "bank", currency: "TRY" });
  await ensureAccount({ name: "Kripto Borsa", type: "crypto", currency: "USDT" });

  // Categories (idempotent)
  await ensureCategory({ name: "Maaş", type: "income" });
  await ensureCategory({ name: "Kira", type: "expense" });
  await ensureCategory({ name: "Market", type: "expense" });
  await ensureCategory({ name: "Ulaşım", type: "expense" });
  await ensureCategory({ name: "Yatırım Geliri", type: "income" });

  // Look up category IDs for sample rules
  const market = await prisma.category.findFirst({
    where: { name: "Market", type: "expense" },
    select: { id: true },
  });
  const ulasim = await prisma.category.findFirst({
    where: { name: "Ulaşım", type: "expense" },
    select: { id: true },
  });

  // Seed rules only if categories exist
  const rulesData = [];
  if (market?.id) {
    rulesData.push(
      { pattern: "a101", isRegex: false, priority: 10, categoryId: market.id },
      { pattern: "migros", isRegex: false, priority: 10, categoryId: market.id },
    );
  }
  if (ulasim?.id) {
    rulesData.push(
      { pattern: "shell|bp|opet", isRegex: true, priority: 20, merchantOnly: true, categoryId: ulasim.id },
    );
  }
  // Insert rules idempotently
  for (const r of rulesData) {
    const exists = await prisma.rule.findFirst({
      where: {
        pattern: r.pattern,
        isRegex: r.isRegex,
        priority: r.priority,
        merchantOnly: r.merchantOnly ?? false,
        categoryId: r.categoryId,
      },
      select: { id: true },
    });
    if (!exists) {
      await prisma.rule.create({ data: r });
    }
  }

  // ----- Quick test seed (optional): holding + price -----
  // Create a sample BTC holding (idempotent-ish: only if a similar record doesn't exist)
  const existingHolding = await prisma.holding.findFirst({
    where: { symbol: "BTCUSDT", assetType: "crypto", currency: "USDT" },
    select: { id: true },
  });
  if (!existingHolding) {
    await prisma.holding.create({
      data: {
        symbol: "BTCUSDT",
        assetType: "crypto",
        currency: "USDT",
        quantity: 0.1,
        avgCost: 60000,
      },
    });
  }
  
  // Create a sample price snapshot (allow multiple snapshots over time)
  await prisma.price.create({
    data: {
      symbol: "BTCUSDT",
      price: 65000,
      currency: "USDT",
      source: "manual",
      asOf: new Date(),
    },
  });
  // -------------------------------------------------------
  console.log("Seed tamam ✅");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });