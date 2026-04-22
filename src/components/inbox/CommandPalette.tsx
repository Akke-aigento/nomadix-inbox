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
  const { filters, update, reset } = useInboxFilters();
  const { data: brands = [] } = useBrandsQuery();
  const [search, setSearch] = useState("");

  // Reset query when opening
  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  // Categories across all brands
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

  // Recent threads (last 30) for quick jump
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
        placeholder="Type a command, brand, category, or thread…"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>No matches found.</CommandEmpty>

        {targetIds.length > 0 && (
          <>
            <CommandGroup heading={`Actions (${targetIds.length} selected)`}>
              <CommandItem
                onSelect={async () => {
                  await archiveThreads(targetIds, qc);
                  toast.success(`Archived ${targetIds.length}`);
                  if (selectedId && targetIds.includes(selectedId)) setSelectedId(null);
                  close();
                }}
              >
                <Archive className="mr-2 h-4 w-4" /> Archive
                <span className="ml-auto text-[10px] text-muted-foreground">e</span>
              </CommandItem>
              <CommandItem
                onSelect={async () => {
                  await setThreadsRead(targetIds, true, qc);
                  toast.success(`Marked ${targetIds.length} read`);
                  close();
                }}
              >
                <MailOpen className="mr-2 h-4 w-4" /> Mark read
                <span className="ml-auto text-[10px] text-muted-foreground">u</span>
              </CommandItem>
              <CommandItem
                onSelect={async () => {
                  await setThreadsRead(targetIds, false, qc);
                  toast.success(`Marked ${targetIds.length} unread`);
                  close();
                }}
              >
                <Mail className="mr-2 h-4 w-4" /> Mark unread
              </CommandItem>
              <CommandItem
                onSelect={async () => {
                  await deleteThreads(targetIds, qc);
                  toast.success(`Deleted ${targetIds.length}`);
                  if (selectedId && targetIds.includes(selectedId)) setSelectedId(null);
                  close();
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
                <span className="ml-auto text-[10px] text-muted-foreground">⇧3</span>
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
            <PenSquare className="mr-2 h-4 w-4" /> New message
            <span className="ml-auto text-[10px] text-muted-foreground">c</span>
          </CommandItem>
          {selectedId && (
            <CommandItem
              onSelect={() => {
                toast.info("Reply — coming in Phase 3C");
                close();
              }}
            >
              <Reply className="mr-2 h-4 w-4" /> Reply to current thread
              <span className="ml-auto text-[10px] text-muted-foreground">r</span>
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Views">
          {VIEW_ITEMS.map((v) => {
            const Icon = v.icon;
            return (
              <CommandItem
                key={v.key}
                value={`view ${v.label}`}
                onSelect={() => goView(v.key)}
              >
                <Icon className="mr-2 h-4 w-4" />
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
                    className="mr-2 h-2.5 w-2.5 rounded-full"
                    style={{ background: b.color_primary }}
                  />
                  {b.name}
                  {i < 9 && (
                    <span className="ml-auto text-[10px] text-muted-foreground">g {i + 1}</span>
                  )}
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
                  <Tag className="mr-2 h-4 w-4" style={{ color: c.color }} />
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
                    className="mr-2 h-2 w-2 flex-none rounded-full"
                    style={{ background: t.brand?.color_primary ?? "hsl(var(--muted-foreground))" }}
                  />
                  <span className="truncate">{t.subject || "(no subject)"}</span>
                  {t.brand?.name && (
                    <span className="ml-2 truncate text-[10px] text-muted-foreground">
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
            <Sparkles className="mr-2 h-4 w-4" /> Clear all filters
          </CommandItem>
          <CommandItem
            onSelect={() => {
              navigate("/settings");
              close();
            }}
          >
            <SettingsIcon className="mr-2 h-4 w-4" /> Open settings
            <span className="ml-auto text-[10px] text-muted-foreground">g s</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
