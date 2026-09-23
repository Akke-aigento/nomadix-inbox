/* eslint-disable react-refresh/only-export-components -- provider en de bijbehorende hooks horen in één bestand */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { loadLocale, saveLocale, translate, type Locale, type Vars } from "./core";
import type { MessageKey } from "./nl";

export * from "./core";

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, vars?: Vars) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => loadLocale());

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    saveLocale(l);
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t: (key, vars) => translate(locale, key, vars) }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n moet binnen <I18nProvider> gebruikt worden");
  return ctx;
}

/** Kort: const t = useT(); t("common.save") */
export function useT() {
  return useI18n().t;
}
