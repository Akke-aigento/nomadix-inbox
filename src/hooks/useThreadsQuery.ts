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
  // Brand slugs resolve to ids once the brands are loaded; the ids are part of
  // the key so a brand filter from the URL refetches when they arrive.
  const brandIds = filters.brands.map((s) => brandSlugToId[s]).filter(Boolean);
  const brandsResolved = filters.brands.length === 0 || brandIds.length > 0;

  return useQuery({
    queryKey: ["threads", filters, brandIds],
    enabled: brandsResolved,
    // Server-side (RPC thread_list): threads + latest message in one query,
    // every filter and the sort applied before the limit. Replaces a second
    // messages fetch that PostgREST capped at 1000 rows and client-side
    // filters that only saw the newest 500 threads.
    queryFn: async () => {
      const since =
        filters.dateRange === "all"
          ? null
          : new Date(Date.now() - (filters.dateRange === "7d" ? 7 : 30) * 86_400_000).toISOString();
      const { data, error } = await supabase.rpc("thread_list", {
        p_view: filters.view,
        p_brand_ids: brandIds.length ? brandIds : null,
        p_state: filters.state,
        p_has_attachments: filters.hasAttachments,
        p_since: since,
        p_urgency: filters.urgency,
        p_from: filters.from || null,
        p_sent_to: filters.sentTo || null,
        p_label_ids: filters.labels?.length ? filters.labels : null,
        p_category_ids: filters.categories?.length ? filters.categories : null,
        p_search: filters.search.trim() || null,
        p_sort: filters.sort,
        p_limit: 500,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as unknown as ThreadRow[];
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
    // Counted server-side: fetching rows and counting in JS was capped at
    // PostgREST's 1000-row limit (1023 active threads on 2026-09-18).
    queryFn: async () => {
      const { data, error } = await supabase.rpc("sidebar_counts");
      if (error) throw error;
      const counts = (data ?? {}) as {
        perBrand?: Record<string, number>;
        totalUnread?: number;
        snoozed?: number;
      };
      return {
        perBrand: counts.perBrand ?? {},
        totalUnread: counts.totalUnread ?? 0,
        snoozed: counts.snoozed ?? 0,
      };
    },
    refetchInterval: 30000,
  });
}
