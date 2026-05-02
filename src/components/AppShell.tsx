import type { ReactNode } from "react";
import { InboxSidebar } from "@/components/inbox/InboxSidebar";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <InboxSidebar />
      <main className="flex flex-1 min-w-0 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
