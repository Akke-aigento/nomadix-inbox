import AppShell from "@/components/AppShell";

export default function InboxPage() {
  return (
    <AppShell>
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Phase 3</div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Inbox coming soon</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          The unified inbox UI lands in Phase 3. For now, head to{" "}
          <a href="/settings" className="text-primary hover:underline">
            Settings
          </a>{" "}
          to configure your brands and Migadu account.
        </p>
      </div>
    </AppShell>
  );
}
