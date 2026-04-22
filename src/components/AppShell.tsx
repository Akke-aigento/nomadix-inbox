import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Inbox, Settings, LogOut } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const location = useLocation();

  const navItem = (to: string, label: string, Icon: typeof Inbox) => {
    const active = location.pathname.startsWith(to);
    return (
      <Link
        to={to}
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
          active
            ? "bg-surface-3 text-foreground"
            : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border surface-1/80 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-7xl items-center gap-4 px-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-sm font-semibold tracking-tight">Nomadix</span>
            <span className="text-xs text-muted-foreground">Unified Inbox</span>
          </div>
          <nav className="ml-4 flex items-center gap-1">
            {navItem("/inbox", "Inbox", Inbox)}
            {navItem("/settings", "Settings", Settings)}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <span className="hidden sm:inline">{user?.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut()}
              className="h-7 px-2 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="ml-1">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
