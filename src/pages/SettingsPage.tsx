import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BrandsTab from "@/components/settings/BrandsTab";
import EmailAccountTab from "@/components/settings/EmailAccountTab";
import LabelsTab from "@/components/settings/LabelsTab";

export default function SettingsPage() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <header className="border-b border-border bg-surface-1 px-8 py-5">
        <h1 className="text-xl font-medium tracking-tight text-text">Settings</h1>
        <p className="mt-0.5 text-xs text-text-muted">
          Manage brands, the Migadu email account, and labels.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-4xl">
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
        </div>
      </div>
    </div>
  );
}
