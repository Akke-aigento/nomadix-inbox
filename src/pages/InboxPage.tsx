import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { InboxSidebar } from "@/components/inbox/InboxSidebar";
import { ThreadList } from "@/components/inbox/ThreadList";
import { ThreadDetail } from "@/components/inbox/ThreadDetail";
import { ShortcutCheatSheet } from "@/components/inbox/ShortcutCheatSheet";
import { CommandPalette } from "@/components/inbox/CommandPalette";
import { useInboxFilters } from "@/hooks/useInboxFilters";
import { useThreadsQuery, useBrandsQuery } from "@/hooks/useThreadsQuery";
import { useRealtimeInbox } from "@/hooks/useRealtimeInbox";
import { useInboxKeyboard } from "@/hooks/useInboxKeyboard";
import { archiveThreads, deleteThreads, setThreadsRead, setThreadsMuted } from "@/lib/inbox-actions";
import type { Density } from "@/components/inbox/ThreadRow";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Archive, Trash2, MailOpen, X, BellOff } from "lucide-react";
import { SnoozePicker } from "@/components/inbox/SnoozePicker";
import { LabelPicker } from "@/components/inbox/LabelPicker";
import { Clock, Tag } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const DENSITY_KEY = "inbox.density";

function loadDensity(): Density {
  try {
    const v = localStorage.getItem(DENSITY_KEY);
    if (v === "compact" || v === "dense" || v === "comfortable") return v;
  } catch {}
  return "comfortable";
}

export default function InboxPage() {
  const navigate = useNavigate();
  const params = useParams<{ threadId?: string }>();
  const qc = useQueryClient();

  const { filters } = useInboxFilters();
  const { data: brands = [] } = useBrandsQuery();
  const brandSlugToId = useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of brands as any[]) m[b.slug] = b.id;
    return m;
  }, [brands]);

  const { data: threads = [], isLoading } = useThreadsQuery(filters, brandSlugToId);
  useRealtimeInbox();

  // Sort threads client-side based on filters.sort
  const sortedThreads = useMemo(() => {
    const arr = [...threads];
    switch (filters.sort) {
      case "oldest":
        arr.sort((a, b) => {
          const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
          const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
          return ta - tb;
        });
        break;
      case "unread":
        arr.sort((a, b) => {
          const ua = (a.unread_count || 0) > 0 ? 1 : 0;
          const ub = (b.unread_count || 0) > 0 ? 1 : 0;
          if (ua !== ub) return ub - ua;
          const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
          const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
          return tb - ta;
        });
        break;
      case "most-replies":
        arr.sort((a, b) => (b.message_count || 0) - (a.message_count || 0));
        break;
      case "newest":
      default:
        arr.sort((a, b) => {
          const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
          const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
          return tb - ta;
        });
    }
    return arr;
  }, [threads, filters.sort]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [density, setDensityState] = useState<Density>(() => loadDensity());
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const setDensity = useCallback((d: Density | ((prev: Density) => Density)) => {
    setDensityState((prev) => {
      const next = typeof d === "function" ? (d as any)(prev) : d;
      try {
        localStorage.setItem(DENSITY_KEY, next);
      } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const selectedId = params.threadId ?? null;

  const setSelectedId = useCallback(
    (id: string | null) => {
      if (id) navigate(`/inbox/${id}`, { replace: false });
      else navigate("/inbox", { replace: false });
    },
    [navigate],
  );

  // Reset focus when filters change
  useEffect(() => {
    setFocusedIndex(0);
  }, [filters.view, filters.brands.join(","), filters.search, filters.sort]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useInboxKeyboard({
    threads: sortedThreads,
    brands: brands as any[],
    focusedIndex,
    setFocusedIndex,
    selectedId,
    setSelectedId,
    selectedIds,
    setSelectedIds,
    toggleSelect,
    setDensity: (fn) => setDensity(fn),
    setSidebarCollapsed,
    setShowCheatSheet,
    setPaletteOpen,
  });

  const bulkArchive = async () => {
    const ids = Array.from(selectedIds);
    await archiveThreads(ids, qc);
    toast.success(`Archived ${ids.length}`);
    setSelectedIds(new Set());
  };
  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    await deleteThreads(ids, qc);
    toast.success(`Deleted ${ids.length}`);
    setSelectedIds(new Set());
  };
  const bulkMarkRead = async () => {
    const ids = Array.from(selectedIds);
    await setThreadsRead(ids, true, qc);
    toast.success(`Marked ${ids.length} read`);
    setSelectedIds(new Set());
  };
  const bulkMute = async () => {
    const ids = Array.from(selectedIds);
    await setThreadsMuted(ids, true, qc);
    toast.success(`Muted ${ids.length}`);
    setSelectedIds(new Set());
  };

  const showList = !isMobile || !selectedId;
  const showDetail = !isMobile || !!selectedId;

  // Close mobile sidebar when navigating
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [filters.view, filters.brands.join(","), selectedId]);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {!isMobile && (
        <InboxSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((b) => !b)} />
      )}

      {isMobile && (
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" className="w-64 p-0">
            <InboxSidebar collapsed={false} onToggle={() => setMobileSidebarOpen(false)} />
          </SheetContent>
        </Sheet>
      )}

      {!isMobile ? (
        <ResizablePanelGroup orientation="horizontal" className="flex-1">
          <ResizablePanel id="list" minSize={20} defaultSize={32}>
            <div className="relative h-full">
              <ThreadList
                threads={sortedThreads}
                loading={isLoading}
                selectedId={selectedId}
                focusedIndex={focusedIndex}
                selectedIds={selectedIds}
                density={density}
                setDensity={setDensity}
                onSelectThread={setSelectedId}
                onToggleSelectId={toggleSelect}
                onFocusIndex={setFocusedIndex}
              />
              <BulkBar
                count={selectedIds.size}
                selectedIds={Array.from(selectedIds)}
                onArchive={bulkArchive}
                onDelete={bulkDelete}
                onMarkRead={bulkMarkRead}
                onMute={bulkMute}
                onClear={() => setSelectedIds(new Set())}
              />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id="detail" minSize={30}>
            <ThreadDetail
              threadId={selectedId}
              onAdvance={() => {
                const next = sortedThreads[focusedIndex] || null;
                setSelectedId(next ? next.id : null);
              }}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="flex-1">
          {showList && (
            <ThreadList
              threads={sortedThreads}
              loading={isLoading}
              selectedId={selectedId}
              focusedIndex={focusedIndex}
              selectedIds={selectedIds}
              density={density}
              setDensity={setDensity}
              onSelectThread={setSelectedId}
              onToggleSelectId={toggleSelect}
              onFocusIndex={setFocusedIndex}
              onOpenSidebar={() => setMobileSidebarOpen(true)}
            />
          )}
          {showDetail && (
            <ThreadDetail
              threadId={selectedId}
              isMobile
              onClose={() => setSelectedId(null)}
              onAdvance={() => setSelectedId(null)}
            />
          )}
        </div>
      )}

      <ShortcutCheatSheet open={showCheatSheet} onOpenChange={setShowCheatSheet} />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        selectedId={selectedId}
        selectedIds={selectedIds}
        setSelectedId={setSelectedId}
      />
    </div>
  );
}

function BulkBar({
  count,
  selectedIds,
  onArchive,
  onDelete,
  onMarkRead,
  onMute,
  onClear,
}: {
  count: number;
  selectedIds: string[];
  onArchive: () => void;
  onDelete: () => void;
  onMarkRead: () => void;
  onMute: () => void;
  onClear: () => void;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 transition-all",
        count > 0 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
      )}
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-popover px-2 py-1.5 shadow-lg">
        <span className="px-2 text-xs font-medium">{count} selected</span>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button variant="ghost" size="sm" className="h-7" onClick={onArchive}>
          <Archive className="mr-1 h-3.5 w-3.5" /> Archive
        </Button>
        <SnoozePicker
          threadIds={selectedIds}
          onSnoozed={onClear}
          trigger={
            <Button variant="ghost" size="sm" className="h-7">
              <Clock className="mr-1 h-3.5 w-3.5" /> Snooze
            </Button>
          }
        />
        <LabelPicker
          threadIds={selectedIds}
          trigger={
            <Button variant="ghost" size="sm" className="h-7">
              <Tag className="mr-1 h-3.5 w-3.5" /> Label
            </Button>
          }
        />
        <Button variant="ghost" size="sm" className="h-7" onClick={onMute}>
          <BellOff className="mr-1 h-3.5 w-3.5" /> Mute
        </Button>
        <Button variant="ghost" size="sm" className="h-7" onClick={onMarkRead}>
          <MailOpen className="mr-1 h-3.5 w-3.5" /> Mark read
        </Button>
        <Button variant="ghost" size="sm" className="h-7" onClick={onDelete}>
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClear} aria-label="Clear selection">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
