import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { InboxSidebar } from "@/components/inbox/InboxSidebar";
import { ThreadList } from "@/components/inbox/ThreadList";
import { ThreadDetail } from "@/components/inbox/ThreadDetail";
import { ShortcutCheatSheet } from "@/components/inbox/ShortcutCheatSheet";
import { CommandPalette } from "@/components/inbox/CommandPalette";
import { BottomNav } from "@/components/inbox/BottomNav";
import { useInboxFilters } from "@/hooks/useInboxFilters";
import { useThreadsQuery, useBrandsQuery } from "@/hooks/useThreadsQuery";
import { useRealtimeInbox } from "@/hooks/useRealtimeInbox";
import { useInboxKeyboard } from "@/hooks/useInboxKeyboard";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  archiveThreads,
  archiveThreadsWithUndo,
  deleteThreads,
  runAction,
  setThreadsRead,
  setThreadsMuted,
} from "@/lib/inbox-actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
  const [density, setDensity] = useDensity();
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Eén breekpunt voor de hele app (matchMedia, 768px).
  const isMobile = useIsMobile();

  // Mobiel: één rij tegelijk opengeveegd, en één vel met extra acties.
  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null);
  const [moreId, setMoreId] = useState<string | null>(null);

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

  // Vegen op een rij. Archiveren gaat meteen door, maar met ongedaan-knop.
  const swipeArchive = useCallback(
    (id: string) => {
      void archiveThreadsWithUndo([id], qc);
    },
    [qc],
  );
  const swipeToggleRead = useCallback(
    (id: string) => {
      const thread = sortedThreads.find((x) => x.id === id);
      const unread = (thread?.unread_count || 0) > 0;
      void runAction(
        () => setThreadsRead([id], unread, qc),
        t(unread ? "inbox.thread.markedRead" : "inbox.thread.markedUnread"),
      );
    },
    [sortedThreads, qc, t],
  );

  const selectionMode = isMobile && selectedIds.size > 0;

  const touchRow = isMobile
    ? {
        selectionMode,
        swipeOpenId,
        onSwipeOpenChange: (id: string, open: boolean) => setSwipeOpenId(open ? id : null),
        onArchive: swipeArchive,
        onToggleRead: swipeToggleRead,
        onMore: (id: string) => setMoreId(id),
        onLongPress: (id: string) => toggleSelect(id),
      }
    : undefined;

  const showList = !isMobile || !selectedId;
  const showDetail = !isMobile || !!selectedId;

  // Een andere view of een ander gesprek sluit een opengeveegde rij.
  useEffect(() => {
    setSwipeOpenId(null);
  }, [filters.view, filters.brands.join(","), selectedId]);

  const list = (
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
      touch={touchRow}
    />
  );

  return (
    <div className={cn("flex h-dvh w-full overflow-hidden", isMobile && "flex-col")}>
      {!isMobile && (
        <InboxSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((b) => !b)} />
      )}

      {!isMobile ? (
        <ResizablePanelGroup orientation="horizontal" className="flex-1">
          <ResizablePanel id="list" minSize={24} defaultSize={36}>
            <div className="relative h-full">
              {list}
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
        <>
          <div className="relative min-h-0 flex-1">
            {showList && list}
            {showDetail && (
              <ThreadDetail
                threadId={selectedId}
                isMobile
                onClose={() => setSelectedId(null)}
                onAdvance={() => setSelectedId(null)}
              />
            )}
            {showList && (
              <BulkBar
                count={selectedIds.size}
                selectedIds={Array.from(selectedIds)}
                onArchive={bulkArchive}
                onDelete={bulkDelete}
                onMarkRead={bulkMarkRead}
                onMute={bulkMute}
                onClear={() => setSelectedIds(new Set())}
                compact
              />
            )}
          </div>
          {/* De onderbalk hoort bij de lijst; een open gesprek heeft zijn
              eigen actiebalk en mag het scherm helemaal vullen. */}
          {showList && <BottomNav />}
        </>
      )}

      {/* Mobiel: de resterende acties achter "Meer" op een opengeveegde rij. */}
      <Sheet open={!!moreId} onOpenChange={(open) => !open && setMoreId(null)}>
        <SheetContent side="bottom" className="pb-safe">
          <SheetHeader className="text-left">
            <SheetTitle>{t("inbox.mobile.rowActions")}</SheetTitle>
          </SheetHeader>
          {moreId && (
            <div className="mt-2 flex flex-col">
              <SnoozePicker
                threadIds={[moreId]}
                onSnoozed={() => {
                  setMoreId(null);
                  setSwipeOpenId(null);
                }}
                trigger={
                  <button className="flex min-h-touch items-center gap-3 px-2 text-sm">
                    <Clock className="h-4 w-4" /> {t("inbox.bulk.snooze")}
                  </button>
                }
              />
              <LabelPicker
                threadIds={[moreId]}
                trigger={
                  <button className="flex min-h-touch items-center gap-3 px-2 text-sm">
                    <Tag className="h-4 w-4" /> {t("inbox.bulk.label")}
                  </button>
                }
              />
              <button
                className="flex min-h-touch items-center gap-3 px-2 text-sm"
                onClick={() => {
                  const id = moreId;
                  setMoreId(null);
                  setSwipeOpenId(null);
                  void runAction(
                    () => setThreadsMuted([id], true, qc),
                    t("inbox.bulk.muted", { count: 1 }),
                  );
                }}
              >
                <BellOff className="h-4 w-4" /> {t("inbox.bulk.mute")}
              </button>
              <button
                className="flex min-h-touch items-center gap-3 px-2 text-sm text-destructive"
                onClick={() => {
                  const id = moreId;
                  setMoreId(null);
                  setSwipeOpenId(null);
                  // deleteThreads toont zelf een toast met ongedaan maken.
                  void runAction(() => deleteThreads([id], qc));
                }}
              >
                <Trash2 className="h-4 w-4" /> {t("inbox.bulk.delete")}
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>

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
  compact,
}: {
  count: number;
  selectedIds: string[];
  onArchive: () => void;
  onDelete: () => void;
  onMarkRead: () => void;
  onMute: () => void;
  onClear: () => void;
  /** Mobiel: boven de onderbalk, alleen iconen. */
  compact?: boolean;
}) {
  const t = useT();
  return (
    <div
      className={cn(
        "pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 transition-all",
        compact ? "bottom-3 w-[calc(100%-1.5rem)]" : "bottom-4",
        count > 0 ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
      )}
    >
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-popover shadow-lg",
          compact ? "justify-between px-1 py-1" : "px-2 py-1.5",
        )}
      >
        <span className={cn("px-2 text-xs font-medium", compact && "pl-3")}>
          {compact ? count : t("inbox.toolbar.selected", { count })}
        </span>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button
          variant="ghost"
          size={compact ? "icon-touch" : "sm"}
          className={compact ? undefined : "h-7"}
          onClick={onArchive}
          aria-label={t("inbox.bulk.archive")}
        >
          <Archive className={compact ? "h-5 w-5" : "mr-1 h-3.5 w-3.5"} />
          {!compact && t("inbox.bulk.archive")}
        </Button>
        <SnoozePicker
          threadIds={selectedIds}
          onSnoozed={onClear}
          trigger={
            <Button
              variant="ghost"
              size={compact ? "icon-touch" : "sm"}
              className={compact ? undefined : "h-7"}
              aria-label={t("inbox.bulk.snooze")}
            >
              <Clock className={compact ? "h-5 w-5" : "mr-1 h-3.5 w-3.5"} />
              {!compact && t("inbox.bulk.snooze")}
            </Button>
          }
        />
        <LabelPicker
          threadIds={selectedIds}
          trigger={
            <Button
              variant="ghost"
              size={compact ? "icon-touch" : "sm"}
              className={compact ? undefined : "h-7"}
              aria-label={t("inbox.bulk.label")}
            >
              <Tag className={compact ? "h-5 w-5" : "mr-1 h-3.5 w-3.5"} />
              {!compact && t("inbox.bulk.label")}
            </Button>
          }
        />
        {!compact && (
          <Button variant="ghost" size="sm" className="h-7" onClick={onMute}>
            <BellOff className="mr-1 h-3.5 w-3.5" /> {t("inbox.bulk.mute")}
          </Button>
        )}
        <Button
          variant="ghost"
          size={compact ? "icon-touch" : "sm"}
          className={compact ? undefined : "h-7"}
          onClick={onMarkRead}
          aria-label={t("inbox.bulk.markRead")}
        >
          <MailOpen className={compact ? "h-5 w-5" : "mr-1 h-3.5 w-3.5"} />
          {!compact && t("inbox.bulk.markRead")}
        </Button>
        <Button
          variant="ghost"
          size={compact ? "icon-touch" : "sm"}
          className={compact ? undefined : "h-7"}
          onClick={onDelete}
          aria-label={t("inbox.bulk.delete")}
        >
          <Trash2 className={compact ? "h-5 w-5" : "mr-1 h-3.5 w-3.5"} />
          {!compact && t("inbox.bulk.delete")}
        </Button>
        <Button
          variant="ghost"
          size={compact ? "icon-touch" : "icon"}
          className={compact ? undefined : "h-7 w-7"}
          onClick={onClear}
          aria-label={t("inbox.bulk.clearSelection")}
        >
          <X className={compact ? "h-5 w-5" : "h-3.5 w-3.5"} />
        </Button>
      </div>
    </div>
  );
}
