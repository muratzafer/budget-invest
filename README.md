# Budget & Invest

Kişisel bütçe, gelir-gider ve yatırım (kripto / hisse / altın & FX) takibi.
Özel erişim (allowlist), CSV/Excel içe aktarma, canlı/güncel fiyatlar, raporlar.

## Teknoloji
- Next.js 15 (App Router, TypeScript)
- TailwindCSS
- Prisma + SQLite (MVP) → Postgres’e geçişe hazır
- NextAuth (allowlist ile sadece izinliler girer)

## Geliştirme
```bash
pnpm install
pnpm dev
```

## Planlı Görevler
- `/api/cron/fx-prices` rotası USD, EUR ve GBP kurları ile altın (XAUUSD/XAUTRY) fiyatını günceller.
- Vercel Cron Scheduler ile örneğin 15 dakikada bir `GET https://<proje-domaini>/api/cron/fx-prices` tetikleyin.
- Çalışma başarısız olursa JSON yanıtında `warnings` alanı hata mesajlarını taşır.
- Route Prisma'yı kullandığından Edge yerine Node runtime seçildiğinden emin olun.
