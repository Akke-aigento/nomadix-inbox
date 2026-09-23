// Datum, tijd en getallen volgen de UI-taal. Eén plek, zodat date-fns nooit
// meer zonder locale draait (en de .replace("minutes","m")-truc weg kan).
import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import { enGB, nl } from "date-fns/locale";
import type { Locale as AppLocale } from "./index";

const LOCALES = { nl, en: enGB } as const;
const INTL = { nl: "nl-BE", en: "en-GB" } as const;

function dateLocale(locale: AppLocale) {
  return LOCALES[locale] ?? nl;
}

export function fmtDate(value: string | Date, locale: AppLocale, pattern = "d MMM"): string {
  return format(new Date(value), pattern, { locale: dateLocale(locale) });
}

export function fmtTime(value: string | Date, locale: AppLocale): string {
  return format(new Date(value), "HH:mm", { locale: dateLocale(locale) });
}

export function fmtDateTime(value: string | Date, locale: AppLocale): string {
  return format(new Date(value), "EEE d MMM, HH:mm", { locale: dateLocale(locale) });
}

/** "3 min geleden" / "3 min ago" — zonder suffix: "3 min". */
export function fmtDistance(value: string | Date, locale: AppLocale, addSuffix = true): string {
  return formatDistanceToNowStrict(new Date(value), { locale: dateLocale(locale), addSuffix });
}

/**
 * Compacte tijd voor een lijstrij: vandaag de klok, gisteren het woord,
 * deze week de dag, daarna dag + maand.
 */
export function fmtListTime(value: string | Date, locale: AppLocale, yesterdayLabel: string): string {
  const d = new Date(value);
  if (isToday(d)) return fmtTime(d, locale);
  if (isYesterday(d)) return yesterdayLabel;
  const days = (Date.now() - d.getTime()) / 86_400_000;
  if (days < 7) return format(d, "EEE", { locale: dateLocale(locale) });
  return format(d, "d MMM", { locale: dateLocale(locale) });
}

export function fmtNumber(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(INTL[locale] ?? "nl-BE").format(value);
}
