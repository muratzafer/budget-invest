"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = (theme === "system" ? resolvedTheme : theme) || "light";
  if (!mounted) return null;

  const next = current === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      aria-label="Tema değiştir"
      onClick={() => setTheme(next)}
      className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
    >
      {current === "dark" ? "☀️" : "🌙"} {current === "dark" ? "Açık" : "Koyu"}
    </button>
  );
}