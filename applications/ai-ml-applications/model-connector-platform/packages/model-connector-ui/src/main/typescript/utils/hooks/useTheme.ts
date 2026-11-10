import { useState, useEffect, useCallback } from "react";

export type UiTheme = "light" | "dark";

export interface ThemeInfo {
  readonly theme: UiTheme;
  readonly isDark: boolean;
  readonly isLight: boolean;
  readonly setTheme: (theme: UiTheme) => void;
  readonly toggleTheme: () => void;
}

const THEME_STORAGE_KEY = "mc_ui_theme";

function readInitialTheme(): UiTheme {
  if (typeof window === "undefined") {
    return "light";
  }
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "dark" || stored === "light" ? stored : "light";
}

function applyThemeAttribute(theme: UiTheme): void {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-bs-theme", theme);
    document.documentElement.style.colorScheme = theme;
  }
}

export function useTheme(): ThemeInfo {
  const [theme, setThemeState] = useState<UiTheme>(readInitialTheme);

  useEffect(() => {
    applyThemeAttribute(theme);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  }, [theme]);

  const setTheme = useCallback((nextTheme: UiTheme) => {
    setThemeState(nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  return {
    theme,
    isDark: theme === "dark",
    isLight: theme === "light",
    setTheme,
    toggleTheme,
  };
}

