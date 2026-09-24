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
import { archiveThreads, deleteThreads, runAction, setThreadsRead, setThreadsMuted } from "@/lib/inbox-actions";
import type { Density } from "@/components/inbox/ThreadRow";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Archive, Trash2, MailOpen, X, BellOff } from "lucide-react";
import { SnoozePicker } from "@/components/inbox/SnoozePicker";
import { LabelPicker } from "@/components/inbox/LabelPicker";
import { Clock, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDensity } from "@/lib/density";
import { useT } from "@/i18n";

export default function InboxPage() {
  const t = useT();
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

  // Sorted server-side by thread_list (filters.sort), before the limit.
  const sortedThreads = threads;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [density, setDensity] = useDensity();
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
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

  // Reset focus when filters change
  useEffect(() => {
    setFocusedIndex(0);
  }, [filters.view, filters.brands.join(","), filters.search, filters.sort]);

  // Keep keyboard focus on the open thread, however it was opened (click,
  // deeplink, palette), so list navigation continues from there.
  useEffect(() => {
    if (!selectedId) return;
    const idx = sortedThreads.findIndex((t) => t.id === selectedId);
    if (idx >= 0) setFocusedIndex(idx);
  }, [selectedId, sortedThreads]);

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

  const bulk = async (action: (ids: string[]) => Promise<void>, success?: (n: number) => string) => {
    const ids = Array.from(selectedIds);
    if (await runAction(() => action(ids), success?.(ids.length))) setSelectedIds(new Set());
  };
  const bulkArchive = () =>
    bulk((ids) => archiveThreads(ids, qc), (n) => t("inbox.bulk.archived", { count: n }));
  // deleteThreads shows its own toast with an undo action.
  const bulkDelete = () => bulk((ids) => deleteThreads(ids, qc));
  const bulkMarkRead = () =>
    bulk((ids) => setThreadsRead(ids, true, qc), (n) => t("inbox.bulk.markedRead", { count: n }));
  const bulkMute = () =>
    bulk((ids) => setThreadsMuted(ids, true, qc), (n) => t("inbox.bulk.muted", { count: n }));

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
          <ResizablePanel id="list" minSize={24} defaultSize={36}>
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
          <ResizablePanel id="detail" minSize={30} defaultSize={64}>
            <ThreadDetail
              threadId={selectedId}
              onAdvance={() => {
                // Next thread after the one that was open (it may already be
                // gone from the list after archive/mute/snooze).
                const idx = sortedThreads.findIndex((t) => t.id === selectedId);
                const next =
                  idx >= 0 ? sortedThreads[idx + 1] ?? null : sortedThreads[focusedIndex] ?? null;
                setSelectedId(next && next.id !== selectedId ? next.id : null);
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
  const t = useT();
  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 transition-all",
        count > 0 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
      )}
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-popover px-2 py-1.5 shadow-lg">
        <span className="px-2 text-xs font-medium">
          {t("inbox.toolbar.selected", { count })}
        </span>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button variant="ghost" size="sm" className="h-7" onClick={onArchive}>
          <Archive className="mr-1 h-3.5 w-3.5" /> {t("inbox.bulk.archive")}
        </Button>
        <SnoozePicker
          threadIds={selectedIds}
          onSnoozed={onClear}
          trigger={
            <Button variant="ghost" size="sm" className="h-7">
              <Clock className="mr-1 h-3.5 w-3.5" /> {t("inbox.bulk.snooze")}
            </Button>
          }
        />
        <LabelPicker
          threadIds={selectedIds}
          trigger={
            <Button variant="ghost" size="sm" className="h-7">
              <Tag className="mr-1 h-3.5 w-3.5" /> {t("inbox.bulk.label")}
            </Button>
          }
        />
        <Button variant="ghost" size="sm" className="h-7" onClick={onMute}>
          <BellOff className="mr-1 h-3.5 w-3.5" /> {t("inbox.bulk.mute")}
        </Button>
        <Button variant="ghost" size="sm" className="h-7" onClick={onMarkRead}>
          <MailOpen className="mr-1 h-3.5 w-3.5" /> {t("inbox.bulk.markRead")}
        </Button>
        <Button variant="ghost" size="sm" className="h-7" onClick={onDelete}>
          <Trash2 className="mr-1 h-3.5 w-3.5" /> {t("inbox.bulk.delete")}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClear} aria-label={t("inbox.bulk.clearSelection")}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
