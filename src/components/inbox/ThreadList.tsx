import { useEffect, useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search } from "lucide-react";
import { useBrandsQuery, type ThreadRow } from "@/hooks/useThreadsQuery";
import { useT } from "@/i18n";
import { viewDef } from "@/lib/views";
import { ThreadRowItem, THREAD_ROW_HEIGHT, type Density } from "./ThreadRow";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useInboxFilters } from "@/hooks/useInboxFilters";
import { EmptyInbox, NoResults } from "./EmptyStates";
import { FilterChips } from "./FilterChips";
import { InboxToolbar } from "./InboxToolbar";

interface Props {
  threads: ThreadRow[];
  loading: boolean;
  selectedId: string | null;
  focusedIndex: number;
  selectedIds: Set<string>;
  density: Density;
  setDensity: (d: Density) => void;
  onSelectThread: (id: string) => void;
  onToggleSelectId: (id: string) => void;
  onFocusIndex: (i: number) => void;
  /** Alleen op een telefoon: vegen, lang indrukken en de extra acties. */
  touch?: {
    selectionMode: boolean;
    swipeOpenId: string | null;
    onSwipeOpenChange: (id: string, open: boolean) => void;
    onDelete: (id: string) => void;
    onToggleRead: (id: string) => void;
    onMore: (id: string) => void;
    onLongPress: (id: string) => void;
  };
}

export function ThreadList({
  threads,
  loading,
  selectedId,
  focusedIndex,
  selectedIds,
  density,
  setDensity,
  onSelectThread,
  onToggleSelectId,
  onFocusIndex,
  touch,
}: Props) {
  const { filters, update, activeChipCount } = useInboxFilters();
  const parentRef = useRef<HTMLDivElement>(null);

  const rowHeight = THREAD_ROW_HEIGHT[density];
  const virtualizer = useVirtualizer({
    count: threads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });

  useEffect(() => {
    if (focusedIndex >= 0 && focusedIndex < threads.length) {
      virtualizer.scrollToIndex(focusedIndex, { align: "auto" });
    }
  }, [focusedIndex, threads.length, virtualizer]);

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  const t = useT();
  const { data: brands = [] } = useBrandsQuery();
  const headerLabel = useMemo(() => {
    if (filters.brands.length === 1) {
      const slug = filters.brands[0];
      return brands.find((b) => b.slug === slug)?.name ?? slug;
    }
    return viewDef(filters.view) ? t(viewDef(filters.view)!.labelKey) : t("views.inbox");
  }, [filters, brands, t]);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Search bar */}
      <div className="flex h-14 items-center gap-2 border-b border-border px-3 pt-safe">
        <div className="flex flex-1 items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            data-inbox-search
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            placeholder={t("inbox.list.searchPlaceholder")}
            className="h-8 border-0 bg-transparent px-0 text-sm focus-visible:ring-0"
          />
        </div>
      </div>

      {/* Title row */}
      <div className="flex h-9 items-center justify-between border-b border-border/60 px-3 text-xs">
        <span className="font-medium uppercase tracking-wider text-muted-foreground">
          {headerLabel}
        </span>
      </div>

      {/* Active filter chips (only render if any) */}
      <FilterChips />

      {/* Toolbar: count + filter popover + sort + density */}
      <InboxToolbar
        density={density}
        setDensity={setDensity}
        total={threads.length}
        selectedCount={selectedIds.size}
      />

      {/* List */}
      {loading ? (
        <div className="flex flex-1 flex-col" aria-busy="true" aria-live="polite">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col justify-center gap-2 border-b border-border/50 px-3"
              style={{ height: rowHeight }}
            >
              <div className="flex items-center gap-3">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3.5 flex-1" />
                <Skeleton className="h-3 w-8" />
              </div>
              {density === "comfortable" && <Skeleton className="h-3 w-2/3" />}
            </div>
          ))}
        </div>
      ) : threads.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          {filters.search || activeChipCount > 0 ? <NoResults /> : <EmptyInbox />}
        </div>
      ) : (
        <div ref={parentRef} className="flex-1 overflow-y-auto">
          <div style={{ height: totalSize, position: "relative" }}>
            {items.map((vi) => {
              const t = threads[vi.index];
              if (!t) return null;
              const isUnread = (t.unread_count || 0) > 0;
              return (
                <div
                  key={t.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <ThreadRowItem
                    thread={t}
                    density={density}
                    selected={selectedIds.has(t.id)}
                    focused={focusedIndex === vi.index}
                    active={selectedId === t.id}
                    isUnread={isUnread}
                    onClick={() => {
                      onFocusIndex(vi.index);
                      onSelectThread(t.id);
                    }}
                    onToggleSelect={() => onToggleSelectId(t.id)}
                    touch={!!touch}
                    selectionMode={touch?.selectionMode ?? false}
                    swipeOpen={touch?.swipeOpenId === t.id}
                    onSwipeOpenChange={(open) => touch?.onSwipeOpenChange(t.id, open)}
                    onDelete={() => touch?.onDelete(t.id)}
                    onToggleRead={() => touch?.onToggleRead(t.id)}
                    onMore={() => touch?.onMore(t.id)}
                    onLongPress={() => touch?.onLongPress(t.id)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
