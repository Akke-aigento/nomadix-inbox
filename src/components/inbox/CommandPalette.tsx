import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Inbox,
  Mail,
  MailOpen,
  PenSquare,
  Reply,
  Settings as SettingsIcon,
  Sparkles,
  Tag,
  Trash2,
  Clock,
  MessageSquareWarning,
  Send,
  FileEdit,
  Mailbox,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useBrandsQuery } from "@/hooks/useThreadsQuery";
import { useInboxFilters, type ViewKind } from "@/hooks/useInboxFilters";
import { archiveThreads, deleteThreads, setThreadsRead } from "@/lib/inbox-actions";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  selectedId: string | null;
  selectedIds: Set<string>;
  setSelectedId: (id: string | null) => void;
}

const VIEW_ITEMS: { key: ViewKind; label: string; icon: any }[] = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "needs-reply", label: "Needs Reply", icon: MessageSquareWarning },
  { key: "snoozed", label: "Snoozed", icon: Clock },
  { key: "sent", label: "Sent", icon: Send },
  { key: "drafts", label: "Drafts", icon: FileEdit },
  { key: "archive", label: "Archive", icon: Archive },
  { key: "all", label: "All Mail", icon: Mailbox },
];

export function CommandPalette({
  open,
  onOpenChange,
  selectedId,
  selectedIds,
  setSelectedId,
}: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { update, reset } = useInboxFilters();
  const { data: brands = [] } = useBrandsQuery();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  const { data: categories = [] } = useQuery({
    queryKey: ["all-brand-categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("brand_categories")
        .select("id, name, slug, brand_id, color")
        .order("sort_order");
      return data ?? [];
    },
  });

  const { data: recentThreads = [] } = useQuery({
    queryKey: ["palette-recent-threads"],
    queryFn: async () => {
      const { data } = await supabase
        .from("threads")
        .select("id, subject, preview, last_message_at, brand:brands(name, color_primary)")
        .order("last_message_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });

  const targetIds = useMemo(() => {
    if (selectedIds.size > 0) return Array.from(selectedIds);
    if (selectedId) return [selectedId];
    return [];
  }, [selectedIds, selectedId]);

  const close = () => onOpenChange(false);

  const goView = (v: ViewKind) => {
    update({ view: v, brands: [] });
    if (window.location.pathname !== "/inbox") navigate("/inbox");
    close();
  };

  const goBrand = (slug: string) => {
    update({ brands: [slug], view: "inbox", categories: [] });
    if (window.location.pathname !== "/inbox") navigate("/inbox");
    close();
  };

  const goCategory = (id: string) => {
    update({ categories: [id], view: "inbox" });
    if (window.location.pathname !== "/inbox") navigate("/inbox");
    close();
  };

  const goThread = (id: string) => {
    setSelectedId(id);
    if (window.location.pathname === "/" || !window.location.pathname.startsWith("/inbox")) {
      navigate(`/inbox/${id}`);
    }
    close();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search, jump, do anything…"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No matches. Try something else?</CommandEmpty>

        {targetIds.length > 0 && (
          <>
            <CommandGroup heading={`Actions · ${targetIds.length} selected`}>
              <CommandItem
                onSelect={async () => {
                  await archiveThreads(targetIds, qc);
                  toast.success(`Archived ${targetIds.length}`);
                  if (selectedId && targetIds.includes(selectedId)) setSelectedId(null);
                  close();
                }}
              >
                <Archive strokeWidth={1.75} /> Archive
                <CommandShortcut>e</CommandShortcut>
              </CommandItem>
              <CommandItem
                onSelect={async () => {
                  await setThreadsRead(targetIds, true, qc);
                  toast.success(`Marked ${targetIds.length} read`);
                  close();
                }}
              >
                <MailOpen strokeWidth={1.75} /> Mark read
                <CommandShortcut>u</CommandShortcut>
              </CommandItem>
              <CommandItem
                onSelect={async () => {
                  await setThreadsRead(targetIds, false, qc);
                  toast.success(`Marked ${targetIds.length} unread`);
                  close();
                }}
              >
                <Mail strokeWidth={1.75} /> Mark unread
              </CommandItem>
              <CommandItem
                onSelect={async () => {
                  await deleteThreads(targetIds, qc);
                  toast.success(`Deleted ${targetIds.length}`);
                  if (selectedId && targetIds.includes(selectedId)) setSelectedId(null);
                  close();
                }}
              >
                <Trash2 strokeWidth={1.75} /> Delete
                <CommandShortcut>⇧3</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Compose">
          <CommandItem
            onSelect={() => {
              toast.info("Compose — coming in Phase 3C");
              close();
            }}
          >
            <PenSquare strokeWidth={1.75} /> New message
            <CommandShortcut>c</CommandShortcut>
          </CommandItem>
          {selectedId && (
            <CommandItem
              onSelect={() => {
                toast.info("Reply — coming in Phase 3C");
                close();
              }}
            >
              <Reply strokeWidth={1.75} /> Reply to current thread
              <CommandShortcut>r</CommandShortcut>
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Views">
          {VIEW_ITEMS.map((v) => {
            const Icon = v.icon;
            return (
              <CommandItem key={v.key} value={`view ${v.label}`} onSelect={() => goView(v.key)}>
                <Icon strokeWidth={1.75} />
                Go to {v.label}
              </CommandItem>
            );
          })}
        </CommandGroup>

        {brands.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Brands">
              {(brands as any[]).map((b, i) => (
                <CommandItem
                  key={b.id}
                  value={`brand ${b.name} ${b.slug}`}
                  onSelect={() => goBrand(b.slug)}
                >
                  <span
                    className="h-2.5 w-2.5 flex-none rounded-full"
                    style={{ background: b.color_primary }}
                    aria-hidden
                  />
                  {b.name}
                  {i < 9 && <CommandShortcut>g {i + 1}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {categories.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Categories">
              {(categories as any[]).slice(0, 20).map((c) => (
                <CommandItem
                  key={c.id}
                  value={`category ${c.name} ${c.slug}`}
                  onSelect={() => goCategory(c.id)}
                >
                  <Tag strokeWidth={1.75} style={{ color: c.color }} />
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {recentThreads.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent threads">
              {(recentThreads as any[]).map((t) => (
                <CommandItem
                  key={t.id}
                  value={`thread ${t.subject ?? ""} ${t.preview ?? ""}`}
                  onSelect={() => goThread(t.id)}
                >
                  <span
                    className="h-2 w-2 flex-none rounded-full"
                    style={{ background: t.brand?.color_primary ?? "hsl(var(--text-tertiary))" }}
                    aria-hidden
                  />
                  <span className="truncate">{t.subject || "(no subject)"}</span>
                  {t.brand?.name && (
                    <span className="ml-auto truncate font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
                      {t.brand.name}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="App">
          <CommandItem
            onSelect={() => {
              reset();
              navigate("/inbox");
              close();
            }}
          >
            <Sparkles strokeWidth={1.75} /> Clear all filters
          </CommandItem>
          <CommandItem
            onSelect={() => {
              navigate("/settings");
              close();
            }}
          >
            <SettingsIcon strokeWidth={1.75} /> Open settings
            <CommandShortcut>g s</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
