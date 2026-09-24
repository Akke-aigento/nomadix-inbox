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
import { archiveThreads, deleteThreads, runAction, setThreadsRead } from "@/lib/inbox-actions";
import { resolveTargetIds } from "@/lib/inbox-targets";
import { VIEWS } from "@/lib/views";
import { useT } from "@/i18n";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  selectedId: string | null;
  selectedIds: Set<string>;
  setSelectedId: (id: string | null) => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  selectedId,
  selectedIds,
  setSelectedId,
}: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const t = useT();
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

  // The palette has no focused row: selection > open thread.
  const targetIds = useMemo(
    () => resolveTargetIds(selectedIds, selectedId, null),
    [selectedIds, selectedId],
  );

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
        placeholder={t("inbox.palette.placeholder")}
        value={search}
        onValueChange={setSearch}
      />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>{t("inbox.palette.empty")}</CommandEmpty>

        {targetIds.length > 0 && (
          <>
            <CommandGroup heading={t("inbox.palette.actions", { count: targetIds.length })}>
              <CommandItem
                onSelect={async () => {
                  close();
                  const ok = await runAction(
                    () => archiveThreads(targetIds, qc),
                    t("inbox.bulk.archived", { count: targetIds.length }),
                  );
                  if (ok && selectedId && targetIds.includes(selectedId)) setSelectedId(null);
                }}
              >
                <Archive className="mr-2 h-4 w-4" /> {t("inbox.palette.archive")}
                <span className="ml-auto text-[10px] text-muted-foreground">e</span>
              </CommandItem>
              <CommandItem
                onSelect={async () => {
                  close();
                  await runAction(
                    () => setThreadsRead(targetIds, true, qc),
                    t("inbox.bulk.markedRead", { count: targetIds.length }),
                  );
                }}
              >
                <MailOpen className="mr-2 h-4 w-4" /> {t("inbox.palette.markRead")}
                <span className="ml-auto text-[10px] text-muted-foreground">u</span>
              </CommandItem>
              <CommandItem
                onSelect={async () => {
                  close();
                  await runAction(
                    () => setThreadsRead(targetIds, false, qc),
                    t("inbox.bulk.markedUnread", { count: targetIds.length }),
                  );
                }}
              >
                <Mail className="mr-2 h-4 w-4" /> {t("inbox.palette.markUnread")}
              </CommandItem>
              <CommandItem
                onSelect={async () => {
                  close();
                  // deleteThreads shows its own toast with an undo action.
                  const ok = await runAction(() => deleteThreads(targetIds, qc));
                  if (ok && selectedId && targetIds.includes(selectedId)) setSelectedId(null);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> {t("common.delete")}
                <span className="ml-auto text-[10px] text-muted-foreground">⇧3</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading={t("inbox.palette.compose")}>
          <CommandItem
            onSelect={() => {
              toast.info(t("inbox.palette.composeSoon"));
              close();
            }}
          >
            <PenSquare className="mr-2 h-4 w-4" /> {t("inbox.palette.newMessage")}
            <span className="ml-auto text-[10px] text-muted-foreground">c</span>
          </CommandItem>
          {selectedId && (
            <CommandItem
              onSelect={() => {
                close();
                // ThreadDetail listens and opens the composer on the open thread.
                window.dispatchEvent(new Event("nomadix:reply"));
              }}
            >
              <Reply className="mr-2 h-4 w-4" /> {t("inbox.palette.replyCurrent")}
              <span className="ml-auto text-[10px] text-muted-foreground">r</span>
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={t("inbox.sidebar.views")}>
          {VIEWS.map((v) => {
            const Icon = v.icon;
            const label = t(v.labelKey);
            return (
              <CommandItem key={v.key} value={`view ${label}`} onSelect={() => goView(v.key)}>
                <Icon className="mr-2 h-4 w-4" />
                {label}
              </CommandItem>
            );
          })}
        </CommandGroup>

        {brands.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("inbox.sidebar.brands")}>
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
            <CommandGroup heading={t("inbox.palette.categories")}>
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
            <CommandGroup heading={t("inbox.palette.recentThreads")}>
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
        <CommandGroup heading={t("inbox.palette.app")}>
          <CommandItem
            onSelect={() => {
              reset();
              navigate("/inbox");
              close();
            }}
          >
            <Sparkles className="mr-2 h-4 w-4" /> {t("inbox.empty.clearFilters")}
          </CommandItem>
          <CommandItem
            onSelect={() => {
              navigate("/settings");
              close();
            }}
          >
            <SettingsIcon className="mr-2 h-4 w-4" /> {t("inbox.palette.openSettings")}
            <span className="ml-auto text-[10px] text-muted-foreground">g s</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
