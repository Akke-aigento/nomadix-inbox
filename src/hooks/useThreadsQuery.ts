import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { InboxFilters } from "./useInboxFilters";

export interface ThreadRow {
  id: string;
  subject: string | null;
  preview: string | null;
  last_message_at: string | null;
  is_archived: boolean;
  is_starred: boolean;
  is_muted: boolean;
  snoozed_until: string | null;
  has_attachments: boolean;
  unread_count: number;
  message_count: number;
  brand_id: string | null;
  participants: any;
  brand?: {
    id: string;
    name: string;
    slug: string;
    color_primary: string;
  } | null;
  latest_message?: {
    from_address: string;
    from_name: string | null;
    subject: string | null;
    body_text: string | null;
    urgency: string;
    needs_reply: boolean | null;
    matched_email_address: string | null;
    received_at: string;
    ai_category: string | null;
  } | null;
}

export function useThreadsQuery(filters: InboxFilters, brandSlugToId: Record<string, string>) {
  return useQuery({
    queryKey: ["threads", filters],
    queryFn: async () => {
      const nowIso = new Date().toISOString();

      let query = supabase
        .from("threads")
        .select(
          `
          id, subject, preview, last_message_at, is_archived, is_starred,
          is_muted, snoozed_until, has_attachments, unread_count, message_count,
          brand_id, participants,
          brand:brands(id, name, slug, color_primary)
          `,
        )
        .order("last_message_at", { ascending: false })
        .limit(500);

      // View-based scoping
      if (filters.view === "inbox" || filters.view === "needs-reply") {
        // Active inbox: not archived, not muted, not currently snoozed
        query = query
          .eq("is_archived", false)
          .eq("is_muted", false)
          .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`);
      } else if (filters.view === "archive") {
        query = query.eq("is_archived", true);
      } else if (filters.view === "snoozed") {
        // Only currently snoozed
        query = query.gt("snoozed_until", nowIso).eq("is_archived", false);
      } else if (filters.view === "muted") {
        query = query.eq("is_muted", true).eq("is_archived", false);
      }

      // Brand filter
      const brandIds = filters.brands.map((s) => brandSlugToId[s]).filter(Boolean);
      if (brandIds.length) query = query.in("brand_id", brandIds);

      // State filter
      if (filters.state === "unread") query = query.gt("unread_count", 0);
      if (filters.state === "read") query = query.eq("unread_count", 0);
      if (filters.state === "archived") query = query.eq("is_archived", true);

      if (filters.hasAttachments) query = query.eq("has_attachments", true);

      // Date range
      if (filters.dateRange !== "all") {
        const days = filters.dateRange === "7d" ? 7 : 30;
        const since = new Date(Date.now() - days * 86400000).toISOString();
        query = query.gte("last_message_at", since);
      }

      const { data: threads, error } = await query;
      if (error) throw error;
      if (!threads?.length) return [] as ThreadRow[];

      const threadIds = threads.map((t) => t.id);
      const { data: messages } = await supabase
        .from("messages")
        .select(
          "thread_id, from_address, from_name, subject, body_text, urgency, needs_reply, matched_email_address, received_at, ai_category",
        )
        .in("thread_id", threadIds)
        .order("received_at", { ascending: false });

      const latestByThread = new Map<string, any>();
      for (const m of messages || []) {
        if (!latestByThread.has(m.thread_id!)) latestByThread.set(m.thread_id!, m);
      }

      let rows: ThreadRow[] = threads.map((t: any) => ({
        ...t,
        latest_message: latestByThread.get(t.id) || null,
      }));

      if (filters.view === "needs-reply" || filters.state === "needs-reply") {
        rows = rows.filter((r) => r.latest_message?.needs_reply === true);
      }
      if (filters.urgency === "high") {
        rows = rows.filter((r) => r.latest_message?.urgency === "high" || r.latest_message?.urgency === "urgent");
      }
      if (filters.from) {
        const q = filters.from.toLowerCase();
        rows = rows.filter((r) => r.latest_message?.from_address?.toLowerCase().includes(q));
      }
      if (filters.sentTo) {
        const q = filters.sentTo.toLowerCase();
        rows = rows.filter((r) => r.latest_message?.matched_email_address?.toLowerCase().includes(q));
      }

      // Label filter (intersection: thread must have ALL selected labels)
      if (filters.labels?.length) {
        const { data: labelLinks } = await supabase
          .from("thread_labels")
          .select("thread_id, label_id")
          .in("thread_id", threadIds)
          .in("label_id", filters.labels);
        const matchByThread = new Map<string, Set<string>>();
        for (const link of labelLinks || []) {
          const tid = link.thread_id as string;
          if (!matchByThread.has(tid)) matchByThread.set(tid, new Set());
          matchByThread.get(tid)!.add(link.label_id as string);
        }
        rows = rows.filter((r) => {
          const set = matchByThread.get(r.id);
          if (!set) return false;
          return filters.labels!.every((lid) => set.has(lid));
        });
      }

      if (filters.search.trim()) {
        const term = filters.search.trim();
        const { data: hits } = await supabase
          .from("messages")
          .select("thread_id")
          .textSearch("subject", term, { type: "websearch", config: "simple" })
          .limit(500);
        const { data: bodyHits } = await supabase
          .from("messages")
          .select("thread_id")
          .ilike("body_text", `%${term}%`)
          .limit(500);
        const matchSet = new Set<string>([
          ...(hits || []).map((h: any) => h.thread_id),
          ...(bodyHits || []).map((h: any) => h.thread_id),
        ]);
        rows = rows.filter((r) => matchSet.has(r.id));
      }

      return rows;
    },
  });
}

export function useBrandsQuery() {
  return useQuery({
    queryKey: ["brands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, name, slug, color_primary, sort_order, is_active")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

export function useSidebarCounts() {
  return useQuery({
    queryKey: ["sidebar-counts"],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data: threads } = await supabase
        .from("threads")
        .select("brand_id, unread_count, snoozed_until, is_muted")
        .eq("is_archived", false)
        .eq("is_muted", false)
        .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`);
      const counts: Record<string, number> = {};
      let total = 0;
      for (const t of threads || []) {
        if ((t.unread_count || 0) > 0) {
          total++;
          if (t.brand_id) counts[t.brand_id] = (counts[t.brand_id] || 0) + 1;
        }
      }

      const { count: snoozedCount } = await supabase
        .from("threads")
        .select("id", { count: "exact", head: true })
        .gt("snoozed_until", nowIso)
        .eq("is_archived", false);

      return {
        perBrand: counts,
        totalUnread: total,
        snoozed: snoozedCount || 0,
      };
    },
    refetchInterval: 30000,
  });
}
