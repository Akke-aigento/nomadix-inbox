import { supabase } from "@/integrations/supabase/client";
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// Every action throws on a database error, so callers can show a failure
// instead of an unconditional success toast.
function check(res: { error: { message: string } | null }) {
  if (res.error) throw new Error(res.error.message);
}

/** Run an action; success toast only when it really succeeded. */
export async function runAction(action: () => Promise<unknown>, success?: string): Promise<boolean> {
  try {
    await action();
    if (success) toast.success(success);
    return true;
  } catch (e) {
    toast.error(`Mislukt: ${(e as Error).message}`);
    return false;
  }
}

export async function archiveThreads(threadIds: string[], qc: QueryClient) {
  if (!threadIds.length) return;
  await qc.cancelQueries({ queryKey: ["threads"] });
  check(await supabase.from("threads").update({ is_archived: true }).in("id", threadIds));
  qc.invalidateQueries({ queryKey: ["threads"] });
  qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
}

export async function unarchiveThreads(threadIds: string[], qc: QueryClient) {
  if (!threadIds.length) return;
  check(await supabase.from("threads").update({ is_archived: false }).in("id", threadIds));
  qc.invalidateQueries({ queryKey: ["threads"] });
  qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
}

const DELETE_UNDO_MS = 6000;

/**
 * Delete with an undo window. The threads disappear from the list at once;
 * the real (irreversible) delete only runs after the toast expires. Closing
 * the tab inside the window means nothing gets deleted — the safe side.
 * Shows its own toasts; callers must not add a success toast.
 */
export async function deleteThreads(threadIds: string[], qc: QueryClient) {
  if (!threadIds.length) return;
  const ids = new Set(threadIds);
  await qc.cancelQueries({ queryKey: ["threads"] });
  const snapshot = qc.getQueriesData({ queryKey: ["threads"] });
  qc.setQueriesData({ queryKey: ["threads"] }, (old: unknown) =>
    Array.isArray(old) ? old.filter((t: { id?: string }) => !ids.has(t?.id ?? "")) : old,
  );

  let undone = false;
  const timer = window.setTimeout(async () => {
    if (undone) return;
    try {
      check(await supabase.from("messages").delete().in("thread_id", threadIds));
      check(await supabase.from("threads").delete().in("id", threadIds));
    } catch (e) {
      toast.error(`Verwijderen mislukt: ${(e as Error).message}`);
    }
    qc.invalidateQueries({ queryKey: ["threads"] });
    qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
  }, DELETE_UNDO_MS);

  toast(`${threadIds.length === 1 ? "Gesprek" : `${threadIds.length} gesprekken`} verwijderd`, {
    duration: DELETE_UNDO_MS,
    action: {
      label: "Ongedaan maken",
      onClick: () => {
        undone = true;
        window.clearTimeout(timer);
        for (const [key, data] of snapshot) qc.setQueryData(key, data);
        qc.invalidateQueries({ queryKey: ["threads"] });
      },
    },
  });
}

// unread_count is maintained by the messages_unread_sync trigger.
export async function setThreadsRead(threadIds: string[], read: boolean, qc: QueryClient) {
  if (!threadIds.length) return;
  check(await supabase.from("messages").update({ is_read: read }).in("thread_id", threadIds));
  qc.invalidateQueries({ queryKey: ["threads"] });
  for (const id of threadIds) qc.invalidateQueries({ queryKey: ["thread", id] });
  qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
}

export async function toggleStar(threadId: string, starred: boolean, qc: QueryClient) {
  check(await supabase.from("threads").update({ is_starred: starred }).eq("id", threadId));
  qc.invalidateQueries({ queryKey: ["threads"] });
}

// ────────────────────────── snooze ──────────────────────────

export async function snoozeThreads(
  threadIds: string[],
  until: Date,
  qc: QueryClient,
) {
  if (!threadIds.length) return;
  check(
    await supabase
      .from("threads")
      .update({ snoozed_until: until.toISOString() })
      .in("id", threadIds),
  );
  qc.invalidateQueries({ queryKey: ["threads"] });
  qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
}

export async function unsnoozeThreads(threadIds: string[], qc: QueryClient) {
  if (!threadIds.length) return;
  check(
    await supabase
      .from("threads")
      .update({ snoozed_until: null })
      .in("id", threadIds),
  );
  qc.invalidateQueries({ queryKey: ["threads"] });
  qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
}

// ────────────────────────── mute ──────────────────────────

export async function setThreadsMuted(
  threadIds: string[],
  muted: boolean,
  qc: QueryClient,
) {
  if (!threadIds.length) return;
  check(await supabase.from("threads").update({ is_muted: muted }).in("id", threadIds));
  qc.invalidateQueries({ queryKey: ["threads"] });
  qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
}

// ────────────────────────── labels ──────────────────────────

export async function addLabelToThreads(
  threadIds: string[],
  labelId: string,
  qc: QueryClient,
) {
  if (!threadIds.length) return;
  const rows = threadIds.map((thread_id) => ({ thread_id, label_id: labelId }));
  check(
    await supabase.from("thread_labels").upsert(rows, {
      onConflict: "thread_id,label_id",
      ignoreDuplicates: true,
    }),
  );
  qc.invalidateQueries({ queryKey: ["thread-labels"] });
  qc.invalidateQueries({ queryKey: ["threads"] });
}

export async function removeLabelFromThreads(
  threadIds: string[],
  labelId: string,
  qc: QueryClient,
) {
  if (!threadIds.length) return;
  check(
    await supabase
      .from("thread_labels")
      .delete()
      .eq("label_id", labelId)
      .in("thread_id", threadIds),
  );
  qc.invalidateQueries({ queryKey: ["thread-labels"] });
  qc.invalidateQueries({ queryKey: ["threads"] });
}

// ────────────────────────── snooze presets ──────────────────────────

export interface SnoozePreset {
  key: string;
  label: string;
  describe: () => string;
  compute: () => Date;
}

function setLocalTime(d: Date, h: number, m = 0): Date {
  const out = new Date(d);
  out.setHours(h, m, 0, 0);
  return out;
}

function nextWeekday(target: number /* 0=Sun..6=Sat */, hour: number): Date {
  const now = new Date();
  const day = now.getDay();
  let delta = (target - day + 7) % 7;
  if (delta === 0) delta = 7;
  const d = new Date(now);
  d.setDate(d.getDate() + delta);
  return setLocalTime(d, hour);
}

export const SNOOZE_PRESETS: SnoozePreset[] = [
  {
    key: "later-today",
    label: "Later vandaag",
    describe: () => "over 3 uur",
    compute: () => new Date(Date.now() + 3 * 60 * 60 * 1000),
  },
  {
    key: "this-evening",
    label: "Vanavond",
    describe: () => "vanavond 18:00",
    compute: () => {
      const d = new Date();
      const target = setLocalTime(d, 18);
      if (target.getTime() < Date.now() + 30 * 60 * 1000) {
        target.setDate(target.getDate() + 1);
      }
      return target;
    },
  },
  {
    key: "tomorrow",
    label: "Morgen",
    describe: () => "morgen 9:00",
    compute: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return setLocalTime(d, 9);
    },
  },
  {
    key: "this-weekend",
    label: "Dit weekend",
    describe: () => "zaterdag 9:00",
    compute: () => nextWeekday(6, 9),
  },
  {
    key: "next-week",
    label: "Volgende week",
    describe: () => "maandag 9:00",
    compute: () => nextWeekday(1, 9),
  },
];
