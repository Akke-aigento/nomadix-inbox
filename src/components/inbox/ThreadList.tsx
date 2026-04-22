import { useEffect, useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search } from "lucide-react";
import type { ThreadRow } from "@/hooks/useThreadsQuery";
import { ThreadRowItem, THREAD_ROW_HEIGHT, type Density } from "./ThreadRow";
import { Input } from "@/components/ui/input";
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

  const headerLabel = useMemo(() => {
    if (filters.brands.length === 1) {
      const slug = filters.brands[0];
      return slug.charAt(0).toUpperCase() + slug.slice(1);
    }
    switch (filters.view) {
      case "inbox":
        return "Inbox";
      case "needs-reply":
        return "Needs Reply";
      case "snoozed":
        return "Snoozed";
      case "sent":
        return "Sent";
      case "drafts":
        return "Drafts";
      case "archive":
        return "Archive";
      case "all":
        return "All Mail";
      default:
        return "Inbox";
    }
  }, [filters]);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Search bar */}
      <div className="flex h-14 items-center gap-2 border-b border-border px-3">
        <div className="flex flex-1 items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            data-inbox-search
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            placeholder="Search mail…   ( / )"
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
        <div className="flex flex-1 flex-col">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="border-b border-border/50 p-3">
              <div className="flex items-center gap-3">
                <div className="h-4 w-32 animate-pulse rounded bg-muted/40" />
                <div className="h-4 flex-1 animate-pulse rounded bg-muted/40" />
                <div className="h-3 w-10 animate-pulse rounded bg-muted/40" />
              </div>
              <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-muted/30" />
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
