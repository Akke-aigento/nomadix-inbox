import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/i18n";
import { useDensity, type Density } from "@/lib/density";

/** Taal, thema en dichtheid. Alles staat in localStorage van dit apparaat —
 *  er is (nog) geen tabel met gebruikersvoorkeuren. */
export default function PreferencesTab() {
  const { locale, setLocale, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const [density, setDensity] = useDensity();

  // next-themes kent het thema pas na mount (server/client-mismatch vermijden).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="max-w-xl space-y-section">
      <section className="space-y-2">
        <Label htmlFor="pref-language">{t("prefs.language.title")}</Label>
        <Select value={locale} onValueChange={(v) => setLocale(v as "nl" | "en")}>
          <SelectTrigger id="pref-language" className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nl">{t("prefs.language.nl")}</SelectItem>
            <SelectItem value="en">{t("prefs.language.en")}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t("prefs.language.help")}</p>
      </section>

      <section className="space-y-2">
        <Label htmlFor="pref-theme">{t("prefs.theme.title")}</Label>
        <Select value={mounted ? (theme ?? "dark") : "dark"} onValueChange={setTheme}>
          <SelectTrigger id="pref-theme" className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">{t("prefs.theme.system")}</SelectItem>
            <SelectItem value="light">{t("prefs.theme.light")}</SelectItem>
            <SelectItem value="dark">{t("prefs.theme.dark")}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t("prefs.theme.help")}</p>
      </section>

      <section className="space-y-2">
        <Label htmlFor="pref-density">{t("prefs.density.title")}</Label>
        <Select value={density} onValueChange={(v) => setDensity(v as Density)}>
          <SelectTrigger id="pref-density" className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="comfortable">{t("prefs.density.comfortable")}</SelectItem>
            <SelectItem value="compact">{t("prefs.density.compact")}</SelectItem>
            <SelectItem value="dense">{t("prefs.density.dense")}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t("prefs.density.help")}</p>
      </section>

      <p className="text-2xs text-muted-foreground">{t("prefs.storage.note")}</p>
    </div>
  );
}
