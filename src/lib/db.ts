import { PrismaClient } from "@prisma/client";

declare global {
  // `globalThis.prisma` tekrar tekrar client oluşturmamak için
  // sadece type-safe olarak tanımlanıyor
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.prisma ??
  new PrismaClient({
    log: ["query", "error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}