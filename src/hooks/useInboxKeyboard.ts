import { useEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { archiveThreads, deleteThreads, setThreadsRead } from "@/lib/inbox-actions";
import type { ThreadRow } from "@/hooks/useThreadsQuery";
import { toast } from "sonner";
import type { Density } from "@/components/inbox/ThreadRow";
import { useInboxFilters } from "@/hooks/useInboxFilters";

interface Args {
  threads: ThreadRow[];
  brands: any[];
  focusedIndex: number;
  setFocusedIndex: (i: number) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selectedIds: Set<string>;
  setSelectedIds: (s: Set<string>) => void;
  toggleSelect: (id: string) => void;
  setDensity: (fn: (d: Density) => Density) => void;
  setSidebarCollapsed: (fn: (b: boolean) => boolean) => void;
  setShowCheatSheet: (b: boolean) => void;
  setPaletteOpen: (b: boolean) => void;
}

export function useInboxKeyboard(args: Args) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { update, reset } = useInboxFilters();
  const {
    threads,
    brands,
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
    setPaletteOpen,
  } = args;

  const focusedThread = focusedIndex >= 0 ? threads[focusedIndex] : null;
  const targetIds = (): string[] => {
    if (selectedIds.size > 0) return Array.from(selectedIds);
    if (focusedThread) return [focusedThread.id];
    if (selectedId) return [selectedId];
    return [];
  };

  const opts = { enableOnFormTags: false as const };

  // ============ g-prefix sequence buffer ============
  const gPendingRef = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inField =
        tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      if (inField) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Start sequence on plain "g"
      if (e.key === "g" && gPendingRef.current === null) {
        e.preventDefault();
        gPendingRef.current = window.setTimeout(() => {
          gPendingRef.current = null;
        }, 1500);
        return;
      }

      if (gPendingRef.current !== null) {
        // Resolve sequence
        const k = e.key.toLowerCase();
        clearTimeout(gPendingRef.current);
        gPendingRef.current = null;
        e.preventDefault();

        if (k === "i") {
          reset();
          if (window.location.pathname !== "/inbox") navigate("/inbox");
          return;
        }
        if (k === "r") {
          update({ view: "needs-reply", brands: [] });
          if (window.location.pathname !== "/inbox") navigate("/inbox");
          return;
        }
        if (k === "s") {
          navigate("/settings");
          return;
        }
        if (k === "z") {
          update({ view: "snoozed", brands: [] });
          if (window.location.pathname !== "/inbox") navigate("/inbox");
          return;
        }
        if (k === "m") {
          update({ view: "muted", brands: [] });
          if (window.location.pathname !== "/inbox") navigate("/inbox");
          return;
        }
        if (k === "a") {
          update({ view: "archive", brands: [] });
          if (window.location.pathname !== "/inbox") navigate("/inbox");
          return;
        }
        if (k === "u") {
          update({ state: "unread" });
          return;
        }
        // Brand 1..9
        const n = parseInt(k, 10);
        if (!Number.isNaN(n) && n >= 1 && n <= 9) {
          const brand = brands[n - 1];
          if (brand) {
            update({ brands: [brand.slug], view: "inbox", categories: [] });
            if (window.location.pathname !== "/inbox") navigate("/inbox");
          } else {
            toast.info(`No brand at position ${n}`);
          }
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (gPendingRef.current !== null) clearTimeout(gPendingRef.current);
    };
  }, [brands, navigate, reset, update]);

  // ============ navigation ============
  useHotkeys(
    "j",
    () => {
      const next = Math.min(threads.length - 1, focusedIndex + 1);
      if (next >= 0) setFocusedIndex(next);
    },
    opts,
    [threads, focusedIndex],
  );

  useHotkeys(
    "k",
    () => {
      const prev = Math.max(0, focusedIndex - 1);
      setFocusedIndex(prev);
    },
    opts,
    [focusedIndex],
  );

  useHotkeys(
    "o, enter",
    (e) => {
      e.preventDefault();
      if (focusedThread) setSelectedId(focusedThread.id);
    },
    opts,
    [focusedThread, setSelectedId],
  );

  useHotkeys(
    "e",
    async () => {
      const ids = targetIds();
      if (!ids.length) return;
      await archiveThreads(ids, qc);
      toast.success(`Archived ${ids.length}`);
      setSelectedIds(new Set());
      if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    },
    opts,
    [threads, focusedIndex, selectedIds, selectedId],
  );

  useHotkeys(
    "u",
    async () => {
      const ids = targetIds();
      if (!ids.length) return;
      const t = focusedThread || threads.find((x) => x.id === selectedId);
      const makeUnread = !t || (t.unread_count || 0) === 0;
      await setThreadsRead(ids, !makeUnread, qc);
      toast.success(makeUnread ? "Marked unread" : "Marked read");
    },
    opts,
    [threads, focusedIndex, selectedIds, selectedId],
  );

  useHotkeys(
    "x",
    () => {
      if (focusedThread) toggleSelect(focusedThread.id);
    },
    opts,
    [focusedThread],
  );

  useHotkeys(
    "shift+3, mod+backspace",
    async () => {
      const ids = targetIds();
      if (!ids.length) return;
      await deleteThreads(ids, qc);
      toast.success(`Deleted ${ids.length}`);
      setSelectedIds(new Set());
      if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    },
    opts,
    [threads, focusedIndex, selectedIds, selectedId],
  );

  useHotkeys(
    "y",
    async () => {
      const ids = targetIds();
      if (!ids.length) return;
      await archiveThreads(ids, qc);
      const next = Math.min(threads.length - 1, focusedIndex);
      setFocusedIndex(next);
      const nextThread = threads[next + 1] || threads[next];
      if (nextThread) setSelectedId(nextThread.id);
    },
    opts,
    [threads, focusedIndex],
  );

  useHotkeys("[", () => setSidebarCollapsed((b) => !b), opts);
  useHotkeys(
    "shift+d",
    () => {
      setDensity((d) =>
        d === "comfortable" ? "compact" : d === "compact" ? "dense" : "comfortable",
      );
    },
    opts,
  );

  useHotkeys("shift+slash", () => setShowCheatSheet(true), opts);
  useHotkeys("escape", () => setShowCheatSheet(false), { enableOnFormTags: true });

  // ⌘K / Ctrl+K → command palette
  useHotkeys(
    "mod+k",
    (e) => {
      e.preventDefault();
      setPaletteOpen(true);
    },
    { enableOnFormTags: true },
  );

  // / → focus search input
  useHotkeys(
    "slash",
    (e) => {
      e.preventDefault();
      const el = document.querySelector<HTMLInputElement>("[data-inbox-search]");
      el?.focus();
      el?.select();
    },
    { enableOnFormTags: true },
  );

  // Reply / forward / snooze / label / mute are handled in ThreadDetail
  // (because they need parentMessage / picker UI). Keep these placeholders
  // out of the global hook to avoid double-handling.
  useHotkeys("c", () => toast.info("Compose — coming soon"), opts);
}
