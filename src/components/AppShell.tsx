import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Inbox, Settings, LogOut, Filter } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

export default function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const { user, signOut } = useAuth();
  const location = useLocation();

  const navItem = (to: string, label: string, Icon: typeof Inbox) => {
    const active = location.pathname.startsWith(to);
    return (
      <Link
        to={to}
        className={cn(
          "flex min-h-touch items-center gap-2 rounded-md px-3 text-sm transition-colors md:min-h-0 md:py-1.5",
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
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border surface-1/80 pt-safe backdrop-blur">
        {/* Smal scherm: naam en account op de eerste regel, navigatie eronder. */}
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 md:h-12 md:flex-nowrap md:py-0">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-sm font-semibold tracking-tight">Nomadix</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {t("auth.appName")}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground md:order-last">
            <span className="hidden truncate sm:inline">{user?.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut()}
              className="min-h-touch px-2 text-muted-foreground hover:text-foreground md:h-7 md:min-h-0"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="ml-1">{t("auth.signOut")}</span>
            </Button>
          </div>
          <nav className="-mx-1 flex w-full items-center gap-1 overflow-x-auto px-1 md:ml-4 md:w-auto md:overflow-visible">
            {navItem("/inbox", t("views.inbox"), Inbox)}
            {navItem("/rules", t("rules.title"), Filter)}
            {navItem("/settings", t("settings.title"), Settings)}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 pb-safe">{children}</main>
    </div>
  );
}
