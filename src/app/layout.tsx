import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import ThemeToggle from "@/components/theme-toggle";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Budget & Invest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" suppressHydrationWarning className="h-full">
      <body className="min-h-screen h-full bg-white text-gray-900 dark:bg-gray-900 dark:text-white transition-colors duration-300">
        <Providers>
          <nav className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-neutral-800">
            <span className="font-semibold">Budget & Invest</span>
            <ThemeToggle />
          </nav>

          <main className="p-4">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}