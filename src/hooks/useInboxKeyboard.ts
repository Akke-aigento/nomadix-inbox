import { useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { archiveThreads, deleteThreads, runAction, setThreadsRead } from "@/lib/inbox-actions";
import type { ThreadRow } from "@/hooks/useThreadsQuery";
import { toast } from "sonner";
import { loadLocale, translate } from "@/i18n/core";
import type { MessageKey } from "@/i18n/nl";

// Sneltoetsen leven buiten de render: haal de taal uit de opslag.
const tr = (key: MessageKey, vars?: Record<string, string | number>) =>
  translate(loadLocale(), key, vars);
import type { Density } from "@/components/inbox/ThreadRow";
import { useInboxFilters } from "@/hooks/useInboxFilters";
import { clearSequence, isSequencePending, startSequence } from "@/lib/key-sequence";
import { resolveTargetIds } from "@/lib/inbox-targets";

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
  const targetIds = (): string[] =>
    resolveTargetIds(selectedIds, selectedId, focusedThread?.id ?? null);

  const opts = { enableOnFormTags: false as const };

  // Single-key handlers stay silent while a "g …" sequence is pending
  // (react-hotkeys-hook listens on document, i.e. before the window-level
  // resolver below clears the sequence).
  const guard =
    <A extends unknown[]>(fn: (...args: A) => unknown) =>
    (...args: A) => {
      if (isSequencePending()) return;
      return fn(...args);
    };

  // ============ g-prefix sequence (state shared via lib/key-sequence) ============

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inField =
        tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      if (inField) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Start sequence on plain "g"
      if (e.key === "g" && !isSequencePending()) {
        e.preventDefault();
        startSequence();
        return;
      }

      if (isSequencePending()) {
        // Resolve sequence. preventDefault lets later listeners (ThreadDetail)
        // see the key was consumed.
        const k = e.key.toLowerCase();
        clearSequence();
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
            toast.info(tr("inbox.keys.noBrandAt", { n }));
          }
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearSequence();
    };
  }, [brands, navigate, reset, update]);

  // ============ navigation ============
  useHotkeys(
    "j",
    guard(() => {
      const next = Math.min(threads.length - 1, focusedIndex + 1);
      if (next >= 0) setFocusedIndex(next);
    }),
    opts,
    [threads, focusedIndex],
  );

  useHotkeys(
    "k",
    guard(() => {
      const prev = Math.max(0, focusedIndex - 1);
      setFocusedIndex(prev);
    }),
    opts,
    [focusedIndex],
  );

  useHotkeys(
    "o, enter",
    guard((e: KeyboardEvent) => {
      e.preventDefault();
      if (focusedThread) setSelectedId(focusedThread.id);
    }),
    opts,
    [focusedThread, setSelectedId],
  );

  useHotkeys(
    "e",
    guard(async () => {
      const ids = targetIds();
      if (!ids.length) return;
      await runAction(async () => {
        await archiveThreads(ids, qc);
        setSelectedIds(new Set());
        if (selectedId && ids.includes(selectedId)) setSelectedId(null);
      }, `Archived ${ids.length}`);
    }),
    opts,
    [threads, focusedIndex, selectedIds, selectedId],
  );

  useHotkeys(
    "u",
    guard(async () => {
      const ids = targetIds();
      if (!ids.length) return;
      const t = threads.find((x) => x.id === ids[0]);
      const makeUnread = !t || (t.unread_count || 0) === 0;
      await runAction(
        () => setThreadsRead(ids, !makeUnread, qc),
        tr(makeUnread ? "inbox.thread.markedUnread" : "inbox.thread.markedRead"),
      );
    }),
    opts,
    [threads, focusedIndex, selectedIds, selectedId],
  );

  useHotkeys(
    "x",
    guard(() => {
      if (focusedThread) toggleSelect(focusedThread.id);
    }),
    opts,
    [focusedThread],
  );

  useHotkeys(
    "shift+3, mod+backspace",
    guard(async () => {
      const ids = targetIds();
      if (!ids.length) return;
      // deleteThreads shows its own toast with an undo action.
      await runAction(async () => {
        await deleteThreads(ids, qc);
        setSelectedIds(new Set());
        if (selectedId && ids.includes(selectedId)) setSelectedId(null);
      });
    }),
    opts,
    [threads, focusedIndex, selectedIds, selectedId],
  );

  useHotkeys(
    "y",
    guard(async () => {
      const ids = targetIds();
      if (!ids.length) return;
      // Advance from the thread that was acted on, not from a stale focus.
      const from = threads.findIndex((t) => t.id === ids[0]);
      const base = from >= 0 ? from : focusedIndex;
      const nextThread = threads.slice(base + 1).find((t) => !ids.includes(t.id));
      await runAction(async () => {
        await archiveThreads(ids, qc);
        setSelectedIds(new Set());
        if (nextThread) {
          setFocusedIndex(base);
          setSelectedId(nextThread.id);
        } else {
          setSelectedId(null);
        }
      });
    }),
    opts,
    [threads, focusedIndex, selectedIds, selectedId],
  );

  useHotkeys("[", guard(() => setSidebarCollapsed((b) => !b)), opts);
  useHotkeys(
    "shift+d",
    guard(() => {
      setDensity((d) =>
        d === "comfortable" ? "compact" : d === "compact" ? "dense" : "comfortable",
      );
    }),
    opts,
  );

  useHotkeys("shift+slash", guard(() => setShowCheatSheet(true)), opts);
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
  useHotkeys("c", guard(() => toast.info(tr("inbox.keys.composeSoon"))), opts);
}
