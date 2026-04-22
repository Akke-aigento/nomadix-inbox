import { supabase } from "@/integrations/supabase/client";
import type { QueryClient } from "@tanstack/react-query";

export async function archiveThreads(threadIds: string[], qc: QueryClient) {
  if (!threadIds.length) return;
  await qc.cancelQueries({ queryKey: ["threads"] });
  await supabase.from("threads").update({ is_archived: true }).in("id", threadIds);
  qc.invalidateQueries({ queryKey: ["threads"] });
  qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
}

export async function unarchiveThreads(threadIds: string[], qc: QueryClient) {
  if (!threadIds.length) return;
  await supabase.from("threads").update({ is_archived: false }).in("id", threadIds);
  qc.invalidateQueries({ queryKey: ["threads"] });
  qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
}

export async function deleteThreads(threadIds: string[], qc: QueryClient) {
  if (!threadIds.length) return;
  await supabase.from("messages").delete().in("thread_id", threadIds);
  await supabase.from("threads").delete().in("id", threadIds);
  qc.invalidateQueries({ queryKey: ["threads"] });
  qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
}

export async function setThreadsRead(threadIds: string[], read: boolean, qc: QueryClient) {
  if (!threadIds.length) return;
  await supabase.from("messages").update({ is_read: read }).in("thread_id", threadIds);
  await supabase
    .from("threads")
    .update({ unread_count: read ? 0 : 1 })
    .in("id", threadIds);
  qc.invalidateQueries({ queryKey: ["threads"] });
  qc.invalidateQueries({ queryKey: ["thread", threadIds[0]] });
  qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
}

export async function toggleStar(threadId: string, starred: boolean, qc: QueryClient) {
  await supabase.from("threads").update({ is_starred: starred }).eq("id", threadId);
  qc.invalidateQueries({ queryKey: ["threads"] });
}

// ────────────────────────── snooze ──────────────────────────

export async function snoozeThreads(
  threadIds: string[],
  until: Date,
  qc: QueryClient,
) {
  if (!threadIds.length) return;
  await supabase
    .from("threads")
    .update({ snoozed_until: until.toISOString() })
    .in("id", threadIds);
  qc.invalidateQueries({ queryKey: ["threads"] });
  qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
}

export async function unsnoozeThreads(threadIds: string[], qc: QueryClient) {
  if (!threadIds.length) return;
  await supabase
    .from("threads")
    .update({ snoozed_until: null })
    .in("id", threadIds);
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
  await supabase.from("threads").update({ is_muted: muted }).in("id", threadIds);
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
  await supabase.from("thread_labels").upsert(rows, {
    onConflict: "thread_id,label_id",
    ignoreDuplicates: true,
  });
  qc.invalidateQueries({ queryKey: ["thread-labels"] });
  qc.invalidateQueries({ queryKey: ["threads"] });
}

export async function removeLabelFromThreads(
  threadIds: string[],
  labelId: string,
  qc: QueryClient,
) {
  if (!threadIds.length) return;
  await supabase
    .from("thread_labels")
    .delete()
    .eq("label_id", labelId)
    .in("thread_id", threadIds);
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
