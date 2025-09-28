"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({
  children,
  attribute = "class",
}: {
  children: React.ReactNode;
  attribute?: "class" | "data-theme";
}) {
  return (
    <NextThemesProvider
      attribute={attribute}
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}