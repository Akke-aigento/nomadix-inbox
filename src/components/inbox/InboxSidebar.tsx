import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Inbox,
  MessageSquareReply,
  Clock,
  BellOff,
  Send,
  FileEdit,
  Archive,
  Mail,
  Search,
  Settings as SettingsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthProvider";
import { useInboxFilters, type ViewKind } from "@/hooks/useInboxFilters";
import { useBrandsQuery, useSidebarCounts } from "@/hooks/useThreadsQuery";
import { setBrandAccent } from "@/lib/brand-accent";
import { supabase } from "@/integrations/supabase/client";
import { ensureNoActiveSync } from "@/lib/sync-guard";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const VIEWS: { key: ViewKind; label: string; icon: typeof Inbox; shortcut?: string }[] = [
  { key: "inbox", label: "Inbox", icon: Inbox, shortcut: "g i" },
  { key: "needs-reply", label: "Needs Reply", icon: MessageSquareReply, shortcut: "g r" },
  { key: "snoozed", label: "Snoozed", icon: Clock, shortcut: "g z" },
  { key: "muted", label: "Muted", icon: BellOff, shortcut: "g m" },
  { key: "sent", label: "Sent", icon: Send },
  { key: "drafts", label: "Drafts", icon: FileEdit },
  { key: "archive", label: "Archive", icon: Archive, shortcut: "g a" },
  { key: "all", label: "All Mail", icon: Mail },
];

export function InboxSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { filters, update } = useInboxFilters();
  const { data: brands = [] } = useBrandsQuery();
  const { data: counts } = useSidebarCounts();

  const [lastSync, setLastSync] = useState<string | null>(null);
  const [lastSyncStatus, setLastSyncStatus] = useState<string | null>(null);
  const [activeRunning, setActiveRunning] = useState(false);
  const [localTriggering, setLocalTriggering] = useState(false);

  const onInbox = location.pathname.startsWith("/inbox");

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

  // Keep --accent-glow in sync with the active brand filter (so reloads / direct
  // URLs show the right tint without requiring a click).
  useEffect(() => {
    if (filters.brands.length === 1) {
      setBrandAccent(filters.brands[0]);
    } else {
      setBrandAccent(null);
    }
  }, [filters.brands]);

  const goToView = (v: ViewKind) => {
    setBrandAccent(null);
    if (onInbox) {
      update({ view: v, brands: [] });
    } else {
      const qs = v !== "inbox" ? `?view=${v}` : "";
      navigate(`/inbox${qs}`);
    }
  };

  const goToBrand = (slug: string) => {
    const isOnly = filters.brands.length === 1 && filters.brands[0] === slug;
    setBrandAccent(isOnly ? null : slug);
    if (onInbox) {
      update({ brands: isOnly ? [] : [slug], view: "inbox" });
    } else {
      navigate(isOnly ? "/inbox" : `/inbox?brand=${encodeURIComponent(slug)}`);
    }
  };

  const isViewActive = (v: ViewKind) =>
    onInbox && filters.view === v && filters.brands.length === 0;
  const isBrandActive = (slug: string) => onInbox && filters.brands.includes(slug);

  const openPalette = () => {
    window.dispatchEvent(new CustomEvent("nomadix:open-command-palette"));
  };

  const triggerSync = async () => {
    if (syncing) return;
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
  };

  const syncLabel = syncing
    ? "Syncing…"
    : lastSyncStatus === "error"
      ? "Sync failed — retry"
      : lastSync
        ? `Synced ${formatDistanceToNow(new Date(lastSync), { addSuffix: true })}`
        : "Not synced yet";

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-border bg-surface-1">
      {/* Workspace identity */}
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex size-7 items-center justify-center rounded-md bg-accent-glow/15">
          <span className="text-sm font-medium text-accent-glow">N</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-text">Nomadix Inbox</div>
          {user?.email && (
            <div className="truncate font-mono text-2xs text-text-subtle">{user.email}</div>
          )}
        </div>
      </div>

      {/* Search trigger — opens command palette */}
      <button
        onClick={openPalette}
        className="group mx-3 mb-3 flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-text-muted transition-colors duration-200 ease-swift hover:bg-surface-3 hover:text-text"
      >
        <Search className="size-3.5" strokeWidth={1.5} />
        <span className="flex-1 text-left text-xs">Search</span>
        <kbd className="font-mono text-2xs text-text-subtle transition-colors group-hover:text-text-muted">
          ⌘K
        </kbd>
      </button>

      {/* Views + Brands */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-2 py-2">
        <SidebarSection title="Views">
          {VIEWS.map((v) => {
            const Icon = v.icon;
            const active = isViewActive(v.key);
            const count =
              v.key === "inbox"
                ? counts?.totalUnread
                : v.key === "snoozed"
                  ? counts?.snoozed
                  : undefined;
            return (
              <SidebarItem
                key={v.key}
                icon={<Icon className="size-3.5" strokeWidth={1.5} />}
                label={v.label}
                count={count}
                active={active}
                shortcut={v.shortcut}
                onClick={() => goToView(v.key)}
              />
            );
          })}
        </SidebarSection>

        {brands && brands.length > 0 && (
          <SidebarSection title="Brands">
            {(brands as any[]).map((b) => {
              const active = isBrandActive(b.slug);
              const count = counts?.perBrand?.[b.id] ?? 0;
              return (
                <SidebarBrand
                  key={b.id}
                  name={b.name}
                  color={b.color_primary}
                  count={count}
                  active={active}
                  onClick={() => goToBrand(b.slug)}
                />
              );
            })}
          </SidebarSection>
        )}
      </nav>

      {/* Footer */}
      <div className="space-y-1 border-t border-border px-2 py-2">
        <SidebarItem
          icon={<SettingsIcon className="size-3.5" strokeWidth={1.5} />}
          label="Settings"
          active={location.pathname.startsWith("/settings")}
          onClick={() => navigate("/settings")}
        />
        <button
          onClick={triggerSync}
          disabled={syncing}
          title={syncing ? syncLabel : "Click to sync now"}
          className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-2xs text-text-subtle transition-colors duration-200 ease-swift hover:bg-surface-2 hover:text-text-muted disabled:cursor-default disabled:opacity-60"
        >
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              syncing
                ? "animate-pulse bg-accent-glow"
                : lastSyncStatus === "error"
                  ? "bg-destructive"
                  : "bg-text-subtle/40",
            )}
          />
          <span className="truncate font-mono">{syncLabel}</span>
        </button>
      </div>
    </aside>
  );
}

interface SidebarSectionProps {
  title: string;
  children: React.ReactNode;
}

function SidebarSection({ title, children }: SidebarSectionProps) {
  return (
    <div>
      <div className="mb-1 px-3 font-mono text-2xs uppercase tracking-wide text-text-subtle">
        {title}
      </div>
      <div className="space-y-px">{children}</div>
    </div>
  );
}

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  shortcut?: string;
  onClick: () => void;
}

function SidebarItem({ icon, label, count, active, shortcut, onClick }: SidebarItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-xs transition-colors duration-200 ease-swift",
        active ? "bg-surface-3 text-text" : "text-text-muted hover:bg-surface-2 hover:text-text",
      )}
    >
      <span
        className={cn(
          "flex size-3.5 shrink-0 items-center justify-center",
          active ? "text-accent-glow" : "text-text-subtle group-hover:text-text-muted",
        )}
      >
        {icon}
      </span>
      <span className="flex-1 truncate text-left">{label}</span>
      {count != null && count > 0 ? (
        <span className="font-mono text-2xs text-text-subtle">{count}</span>
      ) : shortcut ? (
        <span className="font-mono text-2xs text-text-subtle opacity-0 transition-opacity group-hover:opacity-100">
          {shortcut}
        </span>
      ) : null}
    </button>
  );
}

interface SidebarBrandProps {
  name: string;
  color: string | null;
  count: number;
  active: boolean;
  onClick: () => void;
}

function SidebarBrand({ name, color, count, active, onClick }: SidebarBrandProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-xs transition-colors duration-200 ease-swift",
        active ? "bg-surface-3 text-text" : "text-text-muted hover:bg-surface-2 hover:text-text",
      )}
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: color || "var(--accent-glow)" }}
      />
      <span className="flex-1 truncate text-left">{name}</span>
      {count > 0 && <span className="font-mono text-2xs text-text-subtle">{count}</span>}
    </button>
  );
}
