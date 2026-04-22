import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Inbox,
  MessageSquareWarning,
  Clock,
  Send,
  FileEdit,
  Archive,
  Mailbox,
  BellOff,
  Settings as SettingsIcon,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBrandsQuery, useSidebarCounts } from "@/hooks/useThreadsQuery";
import { useInboxFilters, type ViewKind } from "@/hooks/useInboxFilters";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { brandAccentStyle, toHslTriplet } from "@/lib/theme";

const VIEWS: { key: ViewKind; label: string; icon: any; shortcut?: string }[] = [
  { key: "inbox", label: "Inbox", icon: Inbox, shortcut: "g i" },
  { key: "needs-reply", label: "Needs Reply", icon: MessageSquareWarning, shortcut: "g r" },
  { key: "snoozed", label: "Snoozed", icon: Clock, shortcut: "g z" },
  { key: "muted", label: "Muted", icon: BellOff, shortcut: "g m" },
  { key: "sent", label: "Sent", icon: Send },
  { key: "drafts", label: "Drafts", icon: FileEdit },
  { key: "archive", label: "Archive", icon: Archive, shortcut: "g a" },
  { key: "all", label: "All Mail", icon: Mailbox },
];

export function InboxSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { filters, update } = useInboxFilters();
  const { data: brands } = useBrandsQuery();
  const { data: counts } = useSidebarCounts();
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase
        .from("email_accounts")
        .select("last_sync_at, last_sync_status")
        .order("last_sync_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (mounted) setLastSync(data?.last_sync_at ?? null);
    };
    load();
    const i = setInterval(load, 30000);
    return () => {
      mounted = false;
      clearInterval(i);
    };
  }, []);

  const setView = (v: ViewKind) => {
    update({ view: v, brands: [] });
    if (location.pathname !== "/inbox") navigate("/inbox");
  };

  const setBrand = (slug: string) => {
    const isOnly = filters.brands.length === 1 && filters.brands[0] === slug;
    update({ brands: isOnly ? [] : [slug], view: "inbox" });
    if (location.pathname !== "/inbox") navigate("/inbox");
  };

  const isViewActive = (v: ViewKind) => filters.view === v && filters.brands.length === 0;
  const isBrandActive = (slug: string) => filters.brands.includes(slug);

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-subtle bg-surface-1 text-text-secondary transition-[width] duration-200",
        collapsed ? "w-[64px]" : "w-[252px]",
      )}
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-subtle px-3">
        {!collapsed && (
          <div className="flex items-baseline gap-2 pl-1">
            <span
              className="font-display italic text-text-primary"
              style={{
                fontSize: "1.25rem",
                fontVariationSettings: '"opsz" 96, "wght" 500',
                letterSpacing: "-0.03em",
              }}
            >
              Nomadix
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-tertiary">
              Inbox
            </span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Views */}
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        <Section title="Views" collapsed={collapsed}>
          {VIEWS.map((v) => {
            const Icon = v.icon;
            const active = isViewActive(v.key);
            const badge =
              v.key === "inbox"
                ? counts?.totalUnread
                : v.key === "snoozed"
                ? counts?.snoozed
                : undefined;
            return (
              <SidebarItem
                key={v.key}
                active={active}
                collapsed={collapsed}
                onClick={() => setView(v.key)}
                icon={<Icon className="h-4 w-4" strokeWidth={1.75} />}
                label={v.label}
                shortcut={v.shortcut}
                badge={badge && badge > 0 ? badge : undefined}
                useBrandAccent={false}
              />
            );
          })}
        </Section>

        {brands && brands.length > 0 && (
          <Section title="Brands" collapsed={collapsed}>
            {brands.map((b: any) => {
              const active = isBrandActive(b.slug);
              const badge = counts?.perBrand?.[b.id] ?? 0;
              const accentStyle = brandAccentStyle(b.color_primary);
              return (
                <SidebarItem
                  key={b.id}
                  active={active}
                  collapsed={collapsed}
                  onClick={() => setBrand(b.slug)}
                  icon={
                    <span
                      className="block h-2 w-2 rounded-full"
                      style={{
                        background: toHslTriplet(b.color_primary)
                          ? `hsl(${toHslTriplet(b.color_primary)})`
                          : b.color_primary,
                      }}
                    />
                  }
                  label={b.name}
                  badge={badge > 0 ? badge : undefined}
                  useBrandAccent
                  styleOverride={accentStyle}
                />
              );
            })}
          </Section>
        )}
      </nav>

      {/* Footer — sync status with bar */}
      <div className="border-t border-subtle p-2">
        <button
          onClick={async () => {
            setSyncing(true);
            try {
              const { data: accs } = await supabase.from("email_accounts").select("id");
              for (const a of accs || []) {
                await supabase.functions.invoke("sync-inbox", { body: { account_id: a.id } });
              }
            } finally {
              setSyncing(false);
            }
          }}
          className={cn(
            "group relative flex w-full items-center gap-2 overflow-hidden rounded-md px-2 py-2 type-ui-xs text-text-tertiary hover:bg-surface-hover hover:text-text-secondary",
            collapsed && "justify-center",
          )}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", syncing && "animate-spin")}
            strokeWidth={1.75}
          />
          {!collapsed && (
            <span className="truncate font-mono text-[11px]">
              {syncing
                ? "Syncing…"
                : lastSync
                ? `Synced ${formatDistanceToNow(new Date(lastSync), { addSuffix: true })}`
                : "Not synced yet"}
            </span>
          )}
          {/* sync progress bar */}
          {!collapsed && (
            <span
              className={cn(
                "absolute bottom-0 left-0 h-px bg-brand transition-all",
                syncing
                  ? "w-full opacity-100 [animation:_shimmer_1.4s_linear_infinite]"
                  : "w-0 opacity-30 group-hover:w-full group-hover:opacity-60",
              )}
            />
          )}
        </button>
        <button
          onClick={() => navigate("/settings")}
          className={cn(
            "mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 type-ui-xs text-text-tertiary hover:bg-surface-hover hover:text-text-secondary",
            collapsed && "justify-center",
          )}
        >
          <SettingsIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
          {!collapsed && <span>Settings</span>}
        </button>
      </div>
    </aside>
  );
}

function Section({
  title,
  collapsed,
  children,
}: {
  title: string;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      {!collapsed && (
        <div className="mb-2 px-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-text-tertiary">
          {title}
        </div>
      )}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SidebarItem({
  active,
  collapsed,
  onClick,
  icon,
  label,
  shortcut,
  badge,
  useBrandAccent,
  styleOverride,
}: {
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  badge?: number;
  useBrandAccent?: boolean;
  styleOverride?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      style={styleOverride}
      className={cn(
        "group relative flex h-9 w-full items-center gap-2.5 overflow-hidden rounded-md px-2 type-ui-sm transition-colors",
        "hover:bg-surface-hover hover:text-text-primary",
        active && "bg-surface-active text-text-primary",
        collapsed && "justify-center",
      )}
    >
      {/* active accent bar */}
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r"
          style={{ background: useBrandAccent ? "hsl(var(--brand-accent))" : "hsl(var(--accent-teal))" }}
        />
      )}
      {/* subtle teal/brand tint when active */}
      {active && (
        <span
          aria-hidden
          className="absolute inset-0 opacity-100"
          style={{
            background: useBrandAccent
              ? "hsl(var(--brand-accent) / 0.06)"
              : "hsl(var(--accent-teal) / 0.06)",
          }}
        />
      )}
      <span
        className={cn(
          "relative z-10 flex h-4 w-4 items-center justify-center",
          active ? "text-text-primary" : "text-text-tertiary group-hover:text-text-secondary",
        )}
      >
        {icon}
      </span>
      {!collapsed && (
        <>
          <span className="relative z-10 flex-1 truncate text-left">{label}</span>
          {badge !== undefined && (
            <span
              className="relative z-10 rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums"
              style={{
                color: useBrandAccent ? "hsl(var(--brand-accent))" : "hsl(var(--text-secondary))",
              }}
            >
              {badge}
            </span>
          )}
          {shortcut && badge === undefined && (
            <span className="relative z-10 font-mono text-[10px] text-text-disabled">
              {shortcut}
            </span>
          )}
        </>
      )}
    </button>
  );
}
