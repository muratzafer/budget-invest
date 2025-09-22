const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // Accounts
  await prisma.account.createMany({
    data: [
      { name: "Nakit", type: "cash", currency: "TRY" },
      { name: "Banka", type: "bank", currency: "TRY" },
      { name: "Kripto Borsa", type: "crypto", currency: "USDT" },
    ],
  });

  // Categories
  await prisma.category.createMany({
    data: [
      { name: "Maaş", type: "income" },
      { name: "Kira", type: "expense" },
      { name: "Market", type: "expense" },
      { name: "Ulaşım", type: "expense" },
      { name: "Yatırım Geliri", type: "income" },
    ],
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seed tamam ✅");
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });