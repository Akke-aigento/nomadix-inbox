import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Filter, LogOut, MoreHorizontal, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthProvider";
import { useInboxFilters, type ViewKind } from "@/hooks/useInboxFilters";
import { useBrandsQuery, useSidebarCounts } from "@/hooks/useThreadsQuery";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { VIEWS } from "@/lib/views";
import { useT } from "@/i18n";

/** Onderbalk op de telefoon: de drie views waar je echt in werkt, plus een
 *  vel met de rest. Alles wat de sidebar op desktop biedt is bereikbaar. */
export function BottomNav() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const { filters, update } = useInboxFilters();
  const { data: brands = [] } = useBrandsQuery();
  const { data: counts } = useSidebarCounts();
  const [moreOpen, setMoreOpen] = useState(false);

  const primary = VIEWS.filter((v) => v.primary);
  const rest = VIEWS.filter((v) => !v.primary);
  const onInbox = location.pathname.startsWith("/inbox");

  const go = (view: ViewKind) => {
    update({ view, brands: [] });
    if (!onInbox) navigate("/inbox");
    setMoreOpen(false);
  };

  const goBrand = (slug: string) => {
    update({ view: "inbox", brands: [slug] });
    if (!onInbox) navigate("/inbox");
    setMoreOpen(false);
  };

  const isActive = (view: ViewKind) =>
    onInbox && filters.view === view && filters.brands.length === 0;

  return (
    <>
      <nav className="flex flex-none items-stretch border-t border-border bg-background pb-safe">
        {primary.map((v) => {
          const active = isActive(v.key);
          const badge = v.key === "inbox" ? counts?.totalUnread ?? 0 : 0;
          return (
            <button
              key={v.key}
              onClick={() => go(v.key)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-touch flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-2xs font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <v.icon className="h-5 w-5" />
              {t(v.labelKey)}
              {badge > 0 && (
                <span className="absolute right-[22%] top-1 min-w-4 rounded-full bg-primary px-1 text-2xs font-semibold leading-4 text-primary-foreground">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex min-h-touch flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-2xs font-medium text-muted-foreground"
        >
          <MoreHorizontal className="h-5 w-5" />
          {t("common.more")}
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto pb-safe">
          <SheetHeader className="text-left">
            <SheetTitle>{t("inbox.mobile.moreTitle")}</SheetTitle>
          </SheetHeader>

          <Section title={t("inbox.mobile.views")}>
            {rest.map((v) => (
              <Item key={v.key} onClick={() => go(v.key)} active={isActive(v.key)}>
                <v.icon className="h-4 w-4" />
                {t(v.labelKey)}
              </Item>
            ))}
          </Section>

          {brands.length > 0 && (
            <Section title={t("inbox.mobile.brands")}>
              {brands.map((b) => (
                <Item
                  key={b.id}
                  onClick={() => goBrand(b.slug)}
                  active={onInbox && filters.brands[0] === b.slug}
                >
                  <span
                    className="h-2.5 w-2.5 flex-none rounded-full"
                    style={{ background: b.color_primary || "hsl(var(--muted-foreground))" }}
                  />
                  <span className="truncate">{b.name}</span>
                  {(counts?.perBrand?.[b.id] ?? 0) > 0 && (
                    <span className="ml-auto text-2xs text-muted-foreground">
                      {counts!.perBrand[b.id]}
                    </span>
                  )}
                </Item>
              ))}
            </Section>
          )}

          <Section title="">
            <Item
              onClick={() => {
                setMoreOpen(false);
                navigate("/rules");
              }}
              active={location.pathname.startsWith("/rules")}
            >
              <Filter className="h-4 w-4" />
              {t("inbox.mobile.rules")}
            </Item>
            <Item
              onClick={() => {
                setMoreOpen(false);
                navigate("/settings");
              }}
              active={location.pathname.startsWith("/settings")}
            >
              <SettingsIcon className="h-4 w-4" />
              {t("inbox.mobile.settings")}
            </Item>
            <Item onClick={() => void signOut()}>
              <LogOut className="h-4 w-4" />
              {t("inbox.mobile.signOut")}
            </Item>
          </Section>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-2">
      {title && (
        <div className="mb-1 px-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </div>
      )}
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function Item({
  onClick,
  active,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex min-h-touch items-center gap-3 rounded-md px-2 text-sm transition-colors",
        active ? "bg-surface-3 text-foreground" : "text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}
