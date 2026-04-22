import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Inbox, Settings, LogOut, Filter } from "lucide-react";
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
          "flex items-center gap-2 rounded-md px-3 py-1.5 type-ui-sm transition-colors",
          active
            ? "bg-surface-3 text-foreground"
            : "text-text-tertiary hover:bg-surface-hover hover:text-text-primary",
        )}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-40 border-b border-subtle bg-surface-1/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-5">
          <Link to="/inbox" className="flex items-baseline gap-2">
            <span className="font-display text-[1.35rem] italic leading-none text-text-primary"
              style={{ fontVariationSettings: '"opsz" 96, "wght" 500', letterSpacing: "-0.03em" }}
            >
              Nomadix
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-tertiary">
              Inbox
            </span>
          </Link>
          <nav className="ml-2 flex items-center gap-1">
            {navItem("/inbox", "Inbox", Inbox)}
            {navItem("/rules", "Rules", Filter)}
            {navItem("/settings", "Settings", Settings)}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden font-mono text-[11px] text-text-tertiary sm:inline">
              {user?.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut()}
              className="h-7 px-2 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="ml-1 type-ui-sm">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-6">{children}</main>
    </div>
  );
}
