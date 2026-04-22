import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Trash2, MailOpen, Mail, MoreHorizontal, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MessageCard, type MessageRecord } from "./MessageCard";
import { NoThreadSelected } from "./EmptyStates";
import type { AttachmentRow } from "./AttachmentPreview";
import { archiveThreads, deleteThreads, setThreadsRead } from "@/lib/inbox-actions";
import { toast } from "sonner";

interface Props {
  threadId: string | null;
  onClose?: () => void;
  onAdvance?: () => void;
}

export function ThreadDetail({ threadId, onClose, onAdvance }: Props) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["thread", threadId],
    enabled: !!threadId,
    queryFn: async () => {
      if (!threadId) return null;
      const { data: thread } = await supabase
        .from("threads")
        .select("id, subject, brand:brands(id, name, color_primary)")
        .eq("id", threadId)
        .maybeSingle();
      const { data: messages } = await supabase
        .from("messages")
        .select(
          "id, from_address, from_name, to_addresses, cc_addresses, subject, body_html, body_text, received_at, matched_email_address, is_read, ai_summary, needs_reply, urgency, sender_type, requires_action",
        )
        .eq("thread_id", threadId)
        .order("received_at", { ascending: true });
      const { data: attachments } = await supabase
        .from("attachments")
        .select("id, message_id, filename, mime_type, size_bytes, storage_path, is_inline")
        .in("message_id", (messages || []).map((m) => m.id));
      return { thread, messages: (messages || []) as MessageRecord[], attachments: (attachments || []) as (AttachmentRow & { message_id: string })[] };
    },
  });

  // Auto-mark messages as read when opening
  useEffect(() => {
    if (!threadId || !data?.messages?.length) return;
    const unread = data.messages.filter((m) => !m.is_read).map((m) => m.id);
    if (!unread.length) return;
    supabase
      .from("messages")
      .update({ is_read: true })
      .in("id", unread)
      .then(() => {
        supabase.from("threads").update({ unread_count: 0 }).eq("id", threadId);
        qc.invalidateQueries({ queryKey: ["threads"] });
        qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
      });
  }, [threadId, data?.messages, qc]);

  const latestAnalyzed = useMemo(() => {
    const list = data?.messages ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      if ((list[i] as any).ai_summary) return list[i] as any;
    }
    return null;
  }, [data?.messages]);
  const aiSummary = latestAnalyzed?.ai_summary as string | undefined;

  if (!threadId) return <NoThreadSelected />;
  if (isLoading || !data?.thread) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>
    );
  }

  const handleArchive = async () => {
    await archiveThreads([threadId], qc);
    toast.success("Archived");
    onAdvance?.();
  };
  const handleDelete = async () => {
    await deleteThreads([threadId], qc);
    toast.success("Deleted");
    onAdvance?.();
  };
  const handleToggleRead = async () => {
    const anyUnread = data.messages.some((m) => !m.is_read);
    await setThreadsRead([threadId], !anyUnread ? false : true, qc);
    toast.success(anyUnread ? "Marked read" : "Marked unread");
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-14 flex-none items-center gap-2 border-b border-border px-4">
        {onClose && (
          <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden" onClick={onClose}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{data.thread.subject || "(no subject)"}</div>
          {data.thread.brand && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: (data.thread.brand as any).color_primary }}
              />
              {(data.thread.brand as any).name}
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleArchive} title="Archive (e)">
          <Archive className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleToggleRead} title="Toggle read (u)">
          {data.messages.some((m) => !m.is_read) ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDelete} title="Delete (#)">
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="More">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {aiSummary ? (
          <div className="mb-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                AI summary
              </span>
              {latestAnalyzed?.urgency === "high" && (
                <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                  Urgent
                </span>
              )}
              {latestAnalyzed?.needs_reply && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Needs reply
                </span>
              )}
              {latestAnalyzed?.requires_action && !latestAnalyzed?.needs_reply && (
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
                  Action required
                </span>
              )}
              {latestAnalyzed?.sender_type &&
                latestAnalyzed.sender_type !== "human" &&
                latestAnalyzed.sender_type !== "unknown" && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {latestAnalyzed.sender_type}
                  </span>
                )}
            </div>
            <div className="text-xs text-foreground/90">{aiSummary}</div>
          </div>
        ) : (
          <div className="mb-3 rounded-lg border border-dashed border-border/50 p-3 text-xs text-muted-foreground">
            AI summary pending — analysis runs automatically after sync.
          </div>
        )}
        <div className="space-y-3">
          {data.messages.map((m, i) => {
            const atts = data.attachments.filter((a) => a.message_id === m.id);
            return (
              <MessageCard
                key={m.id}
                message={m}
                attachments={atts}
                brandName={(data.thread!.brand as any)?.name}
                defaultExpanded={i === data.messages.length - 1 || data.messages.length === 1}
                isLast={i === data.messages.length - 1}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
