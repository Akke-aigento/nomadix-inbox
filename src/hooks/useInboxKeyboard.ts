import { useHotkeys } from "react-hotkeys-hook";
import { useQueryClient } from "@tanstack/react-query";
import { archiveThreads, deleteThreads, setThreadsRead } from "@/lib/inbox-actions";
import type { ThreadRow } from "@/hooks/useThreadsQuery";
import { toast } from "sonner";
import type { Density } from "@/components/inbox/ThreadRow";

interface Args {
  threads: ThreadRow[];
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
}

export function useInboxKeyboard(args: Args) {
  const qc = useQueryClient();
  const {
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
  } = args;

  const focusedThread = focusedIndex >= 0 ? threads[focusedIndex] : null;
  const targetIds = (): string[] => {
    if (selectedIds.size > 0) return Array.from(selectedIds);
    if (focusedThread) return [focusedThread.id];
    if (selectedId) return [selectedId];
    return [];
  };

  // Prevent capture in inputs/textareas
  const opts = { enableOnFormTags: false as const };

  useHotkeys("j", () => {
    const next = Math.min(threads.length - 1, focusedIndex + 1);
    if (next >= 0) setFocusedIndex(next);
  }, opts, [threads, focusedIndex]);

  useHotkeys("k", () => {
    const prev = Math.max(0, focusedIndex - 1);
    setFocusedIndex(prev);
  }, opts, [focusedIndex]);

  useHotkeys("o, enter", (e) => {
    e.preventDefault();
    if (focusedThread) setSelectedId(focusedThread.id);
  }, opts, [focusedThread, setSelectedId]);

  useHotkeys("e", async () => {
    const ids = targetIds();
    if (!ids.length) return;
    await archiveThreads(ids, qc);
    toast.success(`Archived ${ids.length}`);
    setSelectedIds(new Set());
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
  }, opts, [threads, focusedIndex, selectedIds, selectedId]);

  useHotkeys("u", async () => {
    const ids = targetIds();
    if (!ids.length) return;
    // determine target read state based on focused thread
    const t = focusedThread || threads.find((x) => x.id === selectedId);
    const makeUnread = !t || (t.unread_count || 0) === 0;
    await setThreadsRead(ids, !makeUnread, qc);
    toast.success(makeUnread ? "Marked unread" : "Marked read");
  }, opts, [threads, focusedIndex, selectedIds, selectedId]);

  useHotkeys("x", () => {
    if (focusedThread) toggleSelect(focusedThread.id);
  }, opts, [focusedThread]);

  useHotkeys("shift+3, mod+backspace", async () => {
    const ids = targetIds();
    if (!ids.length) return;
    await deleteThreads(ids, qc);
    toast.success(`Deleted ${ids.length}`);
    setSelectedIds(new Set());
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
  }, opts, [threads, focusedIndex, selectedIds, selectedId]);

  useHotkeys("y", async () => {
    const ids = targetIds();
    if (!ids.length) return;
    await archiveThreads(ids, qc);
    const next = Math.min(threads.length - 1, focusedIndex);
    setFocusedIndex(next);
    const nextThread = threads[next + 1] || threads[next];
    if (nextThread) setSelectedId(nextThread.id);
  }, opts, [threads, focusedIndex]);

  useHotkeys("[", () => setSidebarCollapsed((b) => !b), opts);
  useHotkeys("shift+d", () => {
    setDensity((d) => (d === "comfortable" ? "compact" : d === "compact" ? "dense" : "comfortable"));
  }, opts);

  useHotkeys("shift+slash", () => setShowCheatSheet(true), opts);

  useHotkeys("escape", () => setShowCheatSheet(false), { enableOnFormTags: true });

  // Search focus
  useHotkeys("slash, mod+k", (e) => {
    e.preventDefault();
    const el = document.querySelector<HTMLInputElement>("[data-inbox-search]");
    el?.focus();
    el?.select();
  }, { enableOnFormTags: true });

  // Stub shortcuts
  useHotkeys("r", () => toast.info("Reply — coming in Phase 3C"), opts);
  useHotkeys("shift+r", () => toast.info("Reply All — coming in Phase 3C"), opts);
  useHotkeys("f", () => toast.info("Forward — coming in Phase 3C"), opts);
  useHotkeys("s", () => toast.info("Snooze — coming soon"), opts);
}
