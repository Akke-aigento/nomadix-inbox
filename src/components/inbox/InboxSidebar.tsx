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
import { toast } from "sonner";
import { ensureNoActiveSync } from "@/lib/sync-guard";

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
  const [lastSyncStatus, setLastSyncStatus] = useState<string | null>(null);
  const [activeRunning, setActiveRunning] = useState(false);
  const [localTriggering, setLocalTriggering] = useState(false);

  useEffect(() => {
    let mounted = true;
    const HEARTBEAT_STALE_MS = 60_000;
    const load = async () => {
      const { data: acc } = await supabase
        .from("email_accounts")
        .select("last_sync_at, last_sync_status")
        .order("last_sync_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!mounted) return;
      setLastSync(acc?.last_sync_at ?? null);
      setLastSyncStatus(acc?.last_sync_status ?? null);

      // Is there an actively running sync (fresh heartbeat) anywhere?
      const cutoff = new Date(Date.now() - HEARTBEAT_STALE_MS).toISOString();
      const { data: running } = await supabase
        .from("sync_log")
        .select("id")
        .eq("status", "running")
        .gte("last_heartbeat_at", cutoff)
        .limit(1)
        .maybeSingle();
      if (mounted) setActiveRunning(!!running);
    };
    load();
    const i = setInterval(load, 5000);
    return () => {
      mounted = false;
      clearInterval(i);
    };
  }, []);

  const syncing = activeRunning || localTriggering;

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
        "flex h-full flex-col border-r border-border bg-[hsl(var(--sidebar-background))] text-[hsl(var(--sidebar-foreground))] transition-[width]",
        collapsed ? "w-14" : "w-60",
      )}
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-border px-3">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Inbox className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Nomadix</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Views */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
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
                icon={<Icon className="h-4 w-4" />}
                label={v.label}
                shortcut={v.shortcut}
                badge={badge && badge > 0 ? badge : undefined}
                accentHsl="174 80% 40%"
              />
            );
          })}
        </Section>

        {brands && brands.length > 0 && (
          <Section title="Brands" collapsed={collapsed}>
            {brands.map((b: any) => {
              const active = isBrandActive(b.slug);
              const badge = counts?.perBrand?.[b.id] ?? 0;
              return (
                <SidebarItem
                  key={b.id}
                  active={active}
                  collapsed={collapsed}
                  onClick={() => setBrand(b.slug)}
                  icon={
                    <span
                      className="block h-2.5 w-2.5 rounded-full"
                      style={{ background: b.color_primary }}
                    />
                  }
                  label={b.name}
                  badge={badge > 0 ? badge : undefined}
                  accentColor={b.color_primary}
                />
              );
            })}
          </Section>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-2">
        <button
          onClick={async () => {
            setLocalTriggering(true);
            try {
              const { data: accs } = await supabase.from("email_accounts").select("id");
              const accountList = accs || [];
              let skipped = 0;
              for (const a of accountList) {
                const guard = await ensureNoActiveSync(a.id);
                if (guard.ok === false) {
                  skipped++;
                  if (accountList.length === 1) toast.error(guard.reason);
                  continue;
                }
                await supabase.functions.invoke("sync-inbox", { body: { account_id: a.id } });
              }
              if (skipped > 0 && accountList.length > 1) {
                toast.info(`${skipped} account(s) overgeslagen — sync al bezig`);
              }
            } finally {
              setLocalTriggering(false);
            }
          }},
          disabled={syncing}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-[hsl(var(--sidebar-accent))] disabled:opacity-60",
            collapsed && "justify-center",
          )}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
          {!collapsed && (
            <span className="truncate">
              {syncing
                ? "Syncing…"
                : lastSyncStatus === "error"
                ? "Sync failed — retry"
                : lastSyncStatus === "running"
                ? "Sync in progress…"
                : lastSync
                ? `Synced ${formatDistanceToNow(new Date(lastSync), { addSuffix: true })}`
                : "Not synced yet"}
            </span>
          )}
        </button>
        <button
          onClick={() => navigate("/settings")}
          className={cn(
            "mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-[hsl(var(--sidebar-accent))]",
            collapsed && "justify-center",
          )}
        >
          <SettingsIcon className="h-3.5 w-3.5" />
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
    <div className="mb-4">
      {!collapsed && (
        <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
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
  accentColor,
  accentHsl,
}: {
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  badge?: number;
  accentColor?: string;
  accentHsl?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        "group relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        "hover:bg-[hsl(var(--sidebar-accent))]",
        active && "bg-[hsl(var(--sidebar-accent))] text-foreground",
        collapsed && "justify-center",
      )}
      style={
        active && accentColor
          ? { boxShadow: `inset 2px 0 0 0 ${accentColor}` }
          : active && accentHsl
          ? { boxShadow: `inset 2px 0 0 0 hsl(${accentHsl})` }
          : undefined
      }
    >
      <span className="flex h-4 w-4 items-center justify-center text-muted-foreground group-hover:text-foreground">
        {icon}
      </span>
      {!collapsed && (
        <>
          <span className="flex-1 truncate text-left">{label}</span>
          {badge !== undefined && (
            <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {badge}
            </span>
          )}
          {shortcut && !badge && (
            <span className="font-mono text-[10px] text-muted-foreground/50">{shortcut}</span>
          )}
        </>
      )}
    </button>
  );
}
