import AppShell from "@/components/AppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BrandsTab from "@/components/settings/BrandsTab";
import EmailAccountTab from "@/components/settings/EmailAccountTab";
import LabelsTab from "@/components/settings/LabelsTab";
import PreferencesTab from "@/components/settings/PreferencesTab";
import { useT } from "@/i18n";

export default function SettingsPage() {
  const t = useT();

  return (
    <AppShell>
      <div className="mb-section">
        <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      <Tabs defaultValue="brands" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto surface-2 sm:w-auto">
          <TabsTrigger value="brands">{t("settings.tabs.brands")}</TabsTrigger>
          <TabsTrigger value="email">{t("settings.tabs.email")}</TabsTrigger>
          <TabsTrigger value="labels">{t("settings.tabs.labels")}</TabsTrigger>
          <TabsTrigger value="preferences">{t("settings.tabs.preferences")}</TabsTrigger>
        </TabsList>
        <TabsContent value="brands" className="mt-6">
          <BrandsTab />
        </TabsContent>
        <TabsContent value="email" className="mt-6">
          <EmailAccountTab />
        </TabsContent>
        <TabsContent value="labels" className="mt-6">
          <LabelsTab />
        </TabsContent>
        <TabsContent value="preferences" className="mt-6">
          <PreferencesTab />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
