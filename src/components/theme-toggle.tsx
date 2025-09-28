"use client";

import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="rounded border px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-neutral-800 transition"
    >
      {theme === "dark" ? "🌞 Açık Tema" : "🌙 Koyu Tema"}
    </button>
  );
}