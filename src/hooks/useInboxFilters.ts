import { useSearchParams } from "react-router-dom";
import { useCallback, useMemo } from "react";

export type ViewKind =
  | "inbox"
  | "needs-reply"
  | "snoozed"
  | "sent"
  | "drafts"
  | "archive"
  | "all";

export type StateFilter = "all" | "unread" | "read" | "needs-reply" | "archived";

export interface InboxFilters {
  view: ViewKind;
  brands: string[]; // brand slugs
  categories: string[]; // category ids
  state: StateFilter;
  hasAttachments: boolean;
  urgency: "any" | "high";
  from: string;
  sentTo: string;
  dateRange: "7d" | "30d" | "all";
  search: string;
}

export const DEFAULT_FILTERS: InboxFilters = {
  view: "inbox",
  brands: [],
  categories: [],
  state: "all",
  hasAttachments: false,
  urgency: "any",
  from: "",
  sentTo: "",
  dateRange: "all",
  search: "",
};

export function useInboxFilters() {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<InboxFilters>(() => {
    return {
      view: (params.get("view") as ViewKind) || "inbox",
      brands: params.get("brand")?.split(",").filter(Boolean) || [],
      categories: params.get("category")?.split(",").filter(Boolean) || [],
      state: (params.get("state") as StateFilter) || "all",
      hasAttachments: params.get("attach") === "1",
      urgency: (params.get("urgency") as "any" | "high") || "any",
      from: params.get("from") || "",
      sentTo: params.get("to") || "",
      dateRange: (params.get("range") as "7d" | "30d" | "all") || "all",
      search: params.get("q") || "",
    };
  }, [params]);

  const update = useCallback(
    (patch: Partial<InboxFilters>) => {
      const next = { ...filters, ...patch };
      const newParams = new URLSearchParams();
      if (next.view !== "inbox") newParams.set("view", next.view);
      if (next.brands.length) newParams.set("brand", next.brands.join(","));
      if (next.categories.length) newParams.set("category", next.categories.join(","));
      if (next.state !== "all") newParams.set("state", next.state);
      if (next.hasAttachments) newParams.set("attach", "1");
      if (next.urgency !== "any") newParams.set("urgency", next.urgency);
      if (next.from) newParams.set("from", next.from);
      if (next.sentTo) newParams.set("to", next.sentTo);
      if (next.dateRange !== "all") newParams.set("range", next.dateRange);
      if (next.search) newParams.set("q", next.search);
      setParams(newParams, { replace: true });
    },
    [filters, setParams],
  );

  const reset = useCallback(() => {
    setParams(new URLSearchParams(), { replace: true });
  }, [setParams]);

  const activeChipCount = useMemo(() => {
    let n = 0;
    if (filters.brands.length) n++;
    if (filters.categories.length) n++;
    if (filters.state !== "all") n++;
    if (filters.hasAttachments) n++;
    if (filters.urgency !== "any") n++;
    if (filters.from) n++;
    if (filters.sentTo) n++;
    if (filters.dateRange !== "all") n++;
    return n;
  }, [filters]);

  return { filters, update, reset, activeChipCount };
}
