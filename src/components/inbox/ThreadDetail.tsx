import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Trash2,
  MailOpen,
  Mail,
  MoreHorizontal,
  ChevronLeft,
  Reply,
  Clock,
  Tag,
  BellOff,
  Bell,
  ArchiveRestore,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MessageCard, type MessageRecord } from "./MessageCard";
import { NoThreadSelected } from "./EmptyStates";
import type { AttachmentRow } from "./AttachmentPreview";
import {
  archiveThreads,
  deleteThreads,
  setThreadsRead,
  setThreadsMuted,
  unsnoozeThreads,
  unarchiveThreads,
} from "@/lib/inbox-actions";
import { toast } from "sonner";
import { ReplyComposer, type ComposeMode } from "./ReplyComposer";
import { SnoozePicker } from "./SnoozePicker";
import { LabelPicker } from "./LabelPicker";
import { AiDraftCard, type AiDraftRow } from "./AiDraftCard";
import { useThreadLabels, useLabelsQuery, useSnoozeWakeupTick } from "@/hooks/useLabelsQuery";
import { format, formatDistanceToNow } from "date-fns";

interface Props {
  threadId: string | null;
  onClose?: () => void;
  onAdvance?: () => void;
  isMobile?: boolean;
}

interface ComposerState {
  mode: ComposeMode;
  parent: MessageRecord;
  draftId: string | null;
  initialDraft: any | null;
  aiSeed: { subject: string | null; body_html: string } | null;
}

export function ThreadDetail({ threadId, onClose, onAdvance, isMobile }: Props) {
  const qc = useQueryClient();
  useSnoozeWakeupTick();

  const { data, isLoading } = useQuery({
    queryKey: ["thread", threadId],
    enabled: !!threadId,
    queryFn: async () => {
      if (!threadId) return null;
      const { data: thread } = await supabase
        .from("threads")
        .select(
          "id, subject, brand_id, is_archived, is_muted, snoozed_until, brand:brands(id, name, color_primary)",
        )
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
      const { data: drafts } = await supabase
        .from("drafts")
        .select(
          "id, brand_id, in_reply_to_message_id, subject, body_html, to_addresses, cc_addresses, bcc_addresses, updated_at",
        )
        .in("in_reply_to_message_id", (messages || []).map((m) => m.id))
        .order("updated_at", { ascending: false });
      const { data: aiDrafts } = await supabase
        .from("ai_drafts")
        .select(
          "id, message_id, draft_subject, draft_body_html, draft_body_text, status, reasoning, model_used, generated_at",
        )
        .in("message_id", (messages || []).map((m) => m.id));
      return {
        thread,
        messages: (messages || []) as MessageRecord[],
        attachments: (attachments || []) as (AttachmentRow & { message_id: string })[],
        drafts: drafts || [],
        aiDrafts: (aiDrafts || []) as AiDraftRow[],
      };
    },
  });

  const threadIds = useMemo(() => (threadId ? [threadId] : []), [threadId]);
  const { data: threadLabelsMap = {} } = useThreadLabels(threadIds);
  const { data: allLabels = [] } = useLabelsQuery();

  const appliedLabels = useMemo(() => {
    if (!threadId) return [];
    const ids = threadLabelsMap[threadId] || [];
    return allLabels.filter((l) => ids.includes(l.id));
  }, [allLabels, threadLabelsMap, threadId]);

  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);

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

  // Reset composer when switching threads
  useEffect(() => {
    setComposer(null);
    setSnoozeOpen(false);
    setLabelOpen(false);
  }, [threadId]);

  const latestAnalyzed = useMemo(() => {
    const list = data?.messages ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      if ((list[i] as any).ai_summary) return list[i] as any;
    }
    return null;
  }, [data?.messages]);
  const aiSummary = latestAnalyzed?.ai_summary as string | undefined;

  const lastMessage = data?.messages?.[data.messages.length - 1];

  const openComposer = useCallback(
    (mode: ComposeMode, parent: MessageRecord, aiSeed: ComposerState["aiSeed"] = null) => {
      const existingDraft = data?.drafts?.find((d) => d.in_reply_to_message_id === parent.id);
      setComposer({
        mode,
        parent,
        draftId: existingDraft?.id ?? null,
        initialDraft: existingDraft
          ? {
              subject: existingDraft.subject,
              body_html: existingDraft.body_html,
              to_addresses: existingDraft.to_addresses,
              cc_addresses: existingDraft.cc_addresses,
              bcc_addresses: existingDraft.bcc_addresses,
            }
          : null,
        aiSeed,
      });
    },
    [data?.drafts],
  );

  const useAiDraft = useCallback(
    (parent: MessageRecord, draft: AiDraftRow) => {
      openComposer("reply", parent, {
        subject: draft.draft_subject,
        body_html: draft.draft_body_html,
      });
    },
    [openComposer],
  );

  // Keyboard: r/A/f for compose, b for snooze, v for labels, m for mute
  useEffect(() => {
    if (!threadId) return;
    const handler = async (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Compose shortcuts (only if no composer + last message exists)
      if (!composer && lastMessage) {
        if (e.key === "r" && !e.shiftKey) {
          e.preventDefault();
          openComposer("reply", lastMessage);
          return;
        }
        if (e.key === "a" && e.shiftKey) {
          e.preventDefault();
          openComposer("replyAll", lastMessage);
          return;
        }
        if (e.key === "f") {
          e.preventDefault();
          openComposer("forward", lastMessage);
          return;
        }
      }

      if (composer) return; // skip the rest while composing

      if (e.key === "b") {
        e.preventDefault();
        setSnoozeOpen(true);
        return;
      }
      if (e.key === "v") {
        e.preventDefault();
        setLabelOpen(true);
        return;
      }
      if (e.key === "m") {
        e.preventDefault();
        const isMuted = (data?.thread as any)?.is_muted;
        await setThreadsMuted([threadId], !isMuted, qc);
        toast.success(isMuted ? "Mute opgeheven" : "Thread gemute");
        if (!isMuted) onAdvance?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [composer, lastMessage, openComposer, threadId, data?.thread, qc, onAdvance]);

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
  const handleUnarchive = async () => {
    await unarchiveThreads([threadId], qc);
    toast.success("Unarchived");
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
  const handleToggleMute = async () => {
    const isMuted = (data.thread as any).is_muted;
    await setThreadsMuted([threadId], !isMuted, qc);
    toast.success(isMuted ? "Mute opgeheven" : "Thread gemute");
    if (!isMuted) onAdvance?.();
  };
  const handleUnsnooze = async () => {
    await unsnoozeThreads([threadId], qc);
    toast.success("Snooze opgeheven");
  };

  const brandId = (data.thread as any).brand_id as string | null;
  const isMuted = (data.thread as any).is_muted as boolean;
  const isArchived = (data.thread as any).is_archived as boolean;
  const snoozedUntil = (data.thread as any).snoozed_until as string | null;
  const isSnoozedNow = snoozedUntil && new Date(snoozedUntil).getTime() > Date.now();

  return (
    <div className="flex h-full flex-col bg-background">
      {isMobile && onClose && (
        <button
          onClick={onClose}
          className="flex h-10 flex-none items-center gap-1.5 border-b border-border bg-muted/30 px-3 text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to inbox
        </button>
      )}
      <header className="flex h-14 flex-none items-center gap-2 border-b border-border px-4">
        {onClose && !isMobile && (
          <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden" onClick={onClose}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-semibold">{data.thread.subject || "(no subject)"}</div>
            {isMuted && (
              <span className="flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <BellOff className="h-2.5 w-2.5" /> Muted
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {data.thread.brand && (
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: (data.thread.brand as any).color_primary }}
                />
                {(data.thread.brand as any).name}
              </span>
            )}
            {appliedLabels.map((l) => (
              <span
                key={l.id}
                className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{ background: `${l.color}22`, color: l.color }}
              >
                <Tag className="h-2.5 w-2.5" />
                {l.name}
              </span>
            ))}
          </div>
        </div>
        {lastMessage && !composer && (
          <Button variant="outline" size="sm" className="h-8" onClick={() => openComposer("reply", lastMessage)}>
            <Reply className="mr-1.5 h-3.5 w-3.5" /> Reply
          </Button>
        )}
        <SnoozePicker
          threadIds={[threadId]}
          onSnoozed={onAdvance}
          trigger={
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Snooze (b)">
              <Clock className="h-4 w-4" />
            </Button>
          }
        />
        <LabelPicker
          threadIds={[threadId]}
          open={labelOpen}
          onOpenChange={setLabelOpen}
          trigger={
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Labels (v)">
              <Tag className="h-4 w-4" />
            </Button>
          }
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleToggleMute}
          title={isMuted ? "Mute opheffen (m)" : "Mute (m)"}
        >
          {isMuted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        </Button>
        {isArchived ? (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleUnarchive} title="Unarchive">
            <ArchiveRestore className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleArchive} title="Archive (e)">
            <Archive className="h-4 w-4" />
          </Button>
        )}
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

      {/* Keyboard-controlled snooze popover (anchored to header clock icon area) */}
      {snoozeOpen && (
        <div className="pointer-events-none fixed inset-0 z-30">
          <div className="pointer-events-auto absolute right-4 top-14">
            <SnoozePicker
              threadIds={[threadId]}
              onSnoozed={() => {
                setSnoozeOpen(false);
                onAdvance?.();
              }}
              trigger={
                <button
                  ref={(el) => {
                    if (el) queueMicrotask(() => el.click());
                  }}
                  className="h-1 w-1 opacity-0"
                  aria-hidden
                />
              }
            />
          </div>
        </div>
      )}

      {isSnoozedNow && (
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Gesnoozed tot{" "}
            <span className="font-medium text-foreground">
              {format(new Date(snoozedUntil!), "EEE d MMM, HH:mm")}
            </span>{" "}
            ({formatDistanceToNow(new Date(snoozedUntil!), { addSuffix: true })})
          </div>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleUnsnooze}>
            Snooze opheffen
          </Button>
        </div>
      )}

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
            const draftForMsg = data.drafts.find((d) => d.in_reply_to_message_id === m.id);
            return (
              <div key={m.id} className="space-y-3">
                <MessageCard
                  message={m}
                  attachments={atts}
                  brandName={(data.thread!.brand as any)?.name}
                  defaultExpanded={i === data.messages.length - 1 || data.messages.length === 1}
                  isLast={i === data.messages.length - 1}
                  onCompose={!composer ? openComposer : undefined}
                />
                {!composer && draftForMsg && i === data.messages.length - 1 && (
                  <button
                    onClick={() => openComposer("reply", m)}
                    className="ml-1 flex items-center gap-2 rounded-md border border-dashed border-primary/50 bg-primary/5 px-3 py-2 text-xs text-primary transition hover:bg-primary/10"
                  >
                    <Reply className="h-3 w-3" />
                    Resume draft · {draftForMsg.subject || "(no subject)"}
                  </button>
                )}
              </div>
            );
          })}
          {composer && (
            <div className="pt-2">
              <ReplyComposer
                threadId={threadId}
                brandId={brandId}
                parentMessage={composer.parent}
                mode={composer.mode}
                draftId={composer.draftId}
                initialDraft={composer.initialDraft}
                onCancel={() => setComposer(null)}
                onSent={() => setComposer(null)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Tiny helper that opens a SnoozePicker programmatically once from a keyboard trigger. */
function SnoozePickerInline({
  threadId,
  onClose,
  onSnoozed,
}: {
  threadId: string;
  onClose: () => void;
  onSnoozed?: () => void;
}) {
  // We rely on the regular SnoozePicker but force-open it via a controlled trigger.
  // Render an invisible trigger anchored top-right; the popover content positions itself.
  return (
    <div className="pointer-events-none absolute right-4 top-14 z-30">
      <div className="pointer-events-auto">
        <SnoozePickerAuto
          threadId={threadId}
          onClose={onClose}
          onSnoozed={() => {
            onSnoozed?.();
            onClose();
          }}
        />
      </div>
    </div>
  );
}

/** Internal: SnoozePicker with default-open=true to act as a keyboard menu. */
function SnoozePickerAuto({
  threadId,
  onClose,
  onSnoozed,
}: {
  threadId: string;
  onClose: () => void;
  onSnoozed: () => void;
}) {
  // Use a key to force-mount and let the popover open immediately
  return (
    <div className="opacity-0">
      <SnoozePicker
        threadIds={[threadId]}
        onSnoozed={onSnoozed}
        trigger={
          <button
            ref={(el) => {
              // Auto-click to open
              if (el) {
                queueMicrotask(() => el.click());
                // Close hook: when the popover is closed via outside click, we won't know
                // here. The picker calls onSnoozed for valid actions; otherwise user can press Escape.
              }
            }}
            onBlur={onClose}
          >
            ·
          </button>
        }
      />
    </div>
  );
}
