import AppShell from "@/components/AppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BrandsTab from "@/components/settings/BrandsTab";
import EmailAccountTab from "@/components/settings/EmailAccountTab";
import LabelsTab from "@/components/settings/LabelsTab";

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure brands, the Migadu email account, and labels.
        </p>
      </div>

      <Tabs defaultValue="brands" className="w-full">
        <TabsList className="surface-2">
          <TabsTrigger value="brands">Brands</TabsTrigger>
          <TabsTrigger value="email">Email account</TabsTrigger>
          <TabsTrigger value="labels">Labels</TabsTrigger>
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
      </Tabs>
    </AppShell>
  );
}
