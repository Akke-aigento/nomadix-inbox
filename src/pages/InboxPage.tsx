import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { InboxSidebar } from "@/components/inbox/InboxSidebar";
import { ThreadList } from "@/components/inbox/ThreadList";
import { ThreadDetail } from "@/components/inbox/ThreadDetail";
import { ShortcutCheatSheet } from "@/components/inbox/ShortcutCheatSheet";
import { useInboxFilters } from "@/hooks/useInboxFilters";
import { useThreadsQuery, useBrandsQuery } from "@/hooks/useThreadsQuery";
import { useRealtimeInbox } from "@/hooks/useRealtimeInbox";
import { useInboxKeyboard } from "@/hooks/useInboxKeyboard";
import { archiveThreads, deleteThreads, setThreadsRead } from "@/lib/inbox-actions";
import type { Density } from "@/components/inbox/ThreadRow";
import { Button } from "@/components/ui/button";
import { Archive, Trash2, MailOpen, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [density, setDensity] = useState<Density>("comfortable");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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

  // Auto-select first thread on initial load (desktop)
  useEffect(() => {
    if (!isMobile && !selectedId && threads.length > 0 && focusedIndex === 0) {
      // Don't auto-navigate, just keep first focused
    }
  }, [threads.length, isMobile, selectedId, focusedIndex]);

  // Reset focus when filters change
  useEffect(() => {
    setFocusedIndex(0);
  }, [filters.view, filters.brands.join(","), filters.search]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useInboxKeyboard({
    threads,
    focusedIndex,
    setFocusedIndex,
    selectedId,
    setSelectedId,
    selectedIds,
    setSelectedIds,
    toggleSelect,
    setDensity,
    setSidebarCollapsed,
    setShowCheatSheet,
  });

  // Bulk action handlers
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

  const showList = !isMobile || !selectedId;
  const showDetail = !isMobile || !!selectedId;

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {!isMobile && (
        <InboxSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((b) => !b)} />
      )}

      {!isMobile ? (
        <ResizablePanelGroup orientation="horizontal" className="flex-1">
          <ResizablePanel id="list" minSize={20} defaultSize={32}>
            <div className="relative h-full">
              <ThreadList
                threads={threads}
                loading={isLoading}
                selectedId={selectedId}
                focusedIndex={focusedIndex}
                selectedIds={selectedIds}
                density={density}
                onSelectThread={setSelectedId}
                onToggleSelectId={toggleSelect}
                onFocusIndex={setFocusedIndex}
              />
              <BulkBar
                count={selectedIds.size}
                onArchive={bulkArchive}
                onDelete={bulkDelete}
                onMarkRead={bulkMarkRead}
                onClear={() => setSelectedIds(new Set())}
              />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id="detail" minSize={30}>
            <ThreadDetail
              threadId={selectedId}
              onAdvance={() => {
                const next = threads[focusedIndex] || null;
                setSelectedId(next ? next.id : null);
              }}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="flex-1">
          {showList && (
            <ThreadList
              threads={threads}
              loading={isLoading}
              selectedId={selectedId}
              focusedIndex={focusedIndex}
              selectedIds={selectedIds}
              density={density}
              onSelectThread={setSelectedId}
              onToggleSelectId={toggleSelect}
              onFocusIndex={setFocusedIndex}
            />
          )}
          {showDetail && (
            <ThreadDetail
              threadId={selectedId}
              onClose={() => setSelectedId(null)}
              onAdvance={() => setSelectedId(null)}
            />
          )}
        </div>
      )}

      <ShortcutCheatSheet open={showCheatSheet} onOpenChange={setShowCheatSheet} />
    </div>
  );
}

function BulkBar({
  count,
  onArchive,
  onDelete,
  onMarkRead,
  onClear,
}: {
  count: number;
  onArchive: () => void;
  onDelete: () => void;
  onMarkRead: () => void;
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
