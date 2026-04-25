"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getUiCopy,
  normalizeTheme,
  normalizeUiLocale,
  THEME_STORAGE_KEY,
  type ThemeName,
  UI_LOCALE_STORAGE_KEY,
  type UiLocale,
} from "@/lib/ui-preferences";

type AppearanceContextValue = {
  locale: UiLocale;
  theme: ThemeName;
  setLocale: (locale: UiLocale) => void;
  setTheme: (theme: ThemeName) => void;
  copy: ReturnType<typeof getUiCopy>;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<UiLocale>("zh-CN");
  const [theme, setThemeState] = useState<ThemeName>("dark");

  useEffect(() => {
    try {
      setLocaleState(normalizeUiLocale(window.localStorage.getItem(UI_LOCALE_STORAGE_KEY)));
      setThemeState(normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY)));
    } catch {
      // ignore localStorage errors
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, locale);
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore localStorage errors
    }
  }, [locale, theme]);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      locale,
      theme,
      setLocale: (next) => setLocaleState(normalizeUiLocale(next)),
      setTheme: (next) => setThemeState(normalizeTheme(next)),
      copy: getUiCopy(locale),
    }),
    [locale, theme],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error("useAppearance must be used inside AppearanceProvider");
  }
  return context;
}
