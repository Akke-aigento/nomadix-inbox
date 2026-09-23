// Pure i18n-kern (geen React), zodat componenten en tests hem los kunnen
// gebruiken en fast refresh niet struikelt over gemengde exports.
import { en } from "./en";
import { nl, type Dict, type MessageKey } from "./nl";

export type Locale = "nl" | "en";

const DICTS: Record<Locale, Dict> = { nl, en };
export const LOCALE_KEY = "nomadix.locale";

/** Voorkeuren staan op het apparaat: er is geen user_preferences-tabel, en zo
 *  flitst de verkeerde taal nooit even voorbij tijdens het laden. */
export function loadLocale(): Locale {
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    if (v === "nl" || v === "en") return v;
    if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("en")) {
      return "en";
    }
  } catch {
    /* private mode / geblokkeerde opslag: val terug op NL */
  }
  return "nl";
}

export function saveLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    /* opslag geblokkeerd: de keuze geldt dan alleen deze sessie */
  }
}

export type Vars = Record<string, string | number>;

/** {naam} invullen; {count} stuurt ook de |enkelvoud|meervoud|-vorm. */
function interpolate(template: string, vars?: Vars, locale: Locale = "nl"): string {
  let out = template;
  if (vars && "count" in vars && /\|/.test(out)) {
    const forms = out.split("|");
    const rule = new Intl.PluralRules(locale === "nl" ? "nl-BE" : "en-GB").select(Number(vars.count));
    // vorm 1 = one, vorm 2 = other (NL en EN hebben er niet meer nodig)
    out = rule === "one" ? forms[0] : forms[1] ?? forms[0];
  }
  if (!vars) return out;
  return out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

const missing = new Set<string>();

export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  const dict = DICTS[locale] ?? nl;
  const raw = dict[key] ?? nl[key];
  if (raw === undefined) {
    // Nooit een kale sleutel tonen: in productie stil, in dev luid.
    if (import.meta.env.DEV && !missing.has(key)) {
      missing.add(key);
      console.error(`[i18n] ontbrekende sleutel: ${key}`);
    }
    return import.meta.env.DEV ? `⚠︎ ${key}` : "";
  }
  if (import.meta.env.DEV && dict[key] === undefined && !missing.has(`${locale}:${key}`)) {
    missing.add(`${locale}:${key}`);
    console.error(`[i18n] '${key}' ontbreekt in '${locale}', val terug op NL`);
  }
  return interpolate(raw, vars, locale);
}

