import { X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrandsQuery } from "@/hooks/useThreadsQuery";
import { useInboxFilters } from "@/hooks/useInboxFilters";
import { cn } from "@/lib/utils";

export function FilterChips() {
  const { filters, update, reset, activeChipCount } = useInboxFilters();
  const { data: brands = [] } = useBrandsQuery();

  const { data: categories = [] } = useQuery({
    queryKey: ["all-brand-categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("brand_categories")
        .select("id, name, color");
      return data ?? [];
    },
    enabled: filters.categories.length > 0,
  });

  const chips: { key: string; label: string; color?: string; onRemove: () => void }[] = [];

  for (const slug of filters.brands) {
    const b = (brands as any[]).find((x) => x.slug === slug);
    chips.push({
      key: `brand-${slug}`,
      label: b?.name ?? slug,
      color: b?.color_primary,
      onRemove: () => update({ brands: filters.brands.filter((s) => s !== slug) }),
    });
  }

  for (const id of filters.categories) {
    const c = (categories as any[]).find((x) => x.id === id);
    chips.push({
      key: `cat-${id}`,
      label: c?.name ?? "Category",
      color: c?.color,
      onRemove: () => update({ categories: filters.categories.filter((x) => x !== id) }),
    });
  }

  if (filters.state !== "all") {
    chips.push({
      key: "state",
      label: filters.state === "unread" ? "Unread" : filters.state === "read" ? "Read" : filters.state,
      onRemove: () => update({ state: "all" }),
    });
  }

  if (filters.hasAttachments) {
    chips.push({
      key: "attach",
      label: "Has attachment",
      onRemove: () => update({ hasAttachments: false }),
    });
  }

  if (filters.urgency === "high") {
    chips.push({
      key: "urgency",
      label: "Urgent",
      onRemove: () => update({ urgency: "any" }),
    });
  }

  if (filters.from) {
    chips.push({
      key: "from",
      label: `From: ${filters.from}`,
      onRemove: () => update({ from: "" }),
    });
  }

  if (filters.sentTo) {
    chips.push({
      key: "to",
      label: `To: ${filters.sentTo}`,
      onRemove: () => update({ sentTo: "" }),
    });
  }

  if (filters.dateRange !== "all") {
    chips.push({
      key: "range",
      label: filters.dateRange === "7d" ? "Last 7 days" : "Last 30 days",
      onRemove: () => update({ dateRange: "all" }),
    });
  }

  if (filters.search) {
    chips.push({
      key: "search",
      label: `"${filters.search}"`,
      onRemove: () => update({ search: "" }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-3 py-2">
      {chips.map((c) => (
        <button
          key={c.key}
          onClick={c.onRemove}
          className={cn(
            "group inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] text-foreground/90 transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive",
          )}
          title="Remove filter"
        >
          {c.color && (
            <span
              className="h-1.5 w-1.5 flex-none rounded-full"
              style={{ background: c.color }}
            />
          )}
          <span className="max-w-[160px] truncate">{c.label}</span>
          <X className="h-3 w-3 opacity-60 group-hover:opacity-100" />
        </button>
      ))}
      {activeChipCount + (filters.search ? 1 : 0) >= 2 && (
        <button
          onClick={reset}
          className="ml-auto text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
