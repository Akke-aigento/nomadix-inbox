import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Trash2,
  MailOpen,
  Mail,
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
  runAction,
} from "@/lib/inbox-actions";
import { pickReplyParent } from "@/lib/reply-target";
import { useI18n, useT } from "@/i18n";
import { fmtDateTime, fmtDistance } from "@/i18n/format";
import { isSequencePending } from "@/lib/key-sequence";
import { newestFirst, nextExpansion, toggleExpanded, type ExpansionState } from "@/lib/thread-view";
import { ReplyComposer, type ComposeMode } from "./ReplyComposer";
import { SnoozePicker } from "./SnoozePicker";
import { LabelPicker } from "./LabelPicker";
import { AiDraftCard, type AiDraftRow } from "./AiDraftCard";
import { useThreadLabels, useLabelsQuery, useSnoozeWakeupTick } from "@/hooks/useLabelsQuery";

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
  const t = useT();
  const { locale } = useI18n();
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
          "id, from_address, from_name, to_addresses, cc_addresses, reply_to, subject, body_html, body_text, received_at, matched_email_address, is_read, is_outbound, ai_summary, needs_reply, urgency, sender_type, requires_action",
        )
        .eq("thread_id", threadId)
        .order("received_at", { ascending: false }); // newest on top (decision A)
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

  // Auto-mark messages as read — once per opened thread, so marking it unread
  // again ("u") isn't undone by the refetch that follows.
  // threads.unread_count follows via the messages_unread_sync trigger.
  const autoReadDoneRef = useRef<string | null>(null);
  useEffect(() => {
    if (!threadId || !data?.messages?.length) return;
    if (autoReadDoneRef.current === threadId) return;
    autoReadDoneRef.current = threadId;
    const unread = data.messages.filter((m) => !m.is_read).map((m) => m.id);
    if (!unread.length) return;
    supabase
      .from("messages")
      .update({ is_read: true })
      .in("id", unread)
      .then(({ error }) => {
        if (error) return;
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

  // Newest first. Sorted again here because the optimistic sent message is
  // spliced into the cache by hand.
  const messages = useMemo(() => newestFirst(data?.messages ?? []), [data?.messages]);
  const newestId = messages[0]?.id ?? null;

  const latestAnalyzed = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI fields aren't on MessageRecord
    () => (messages.find((m) => (m as any).ai_summary) as any) ?? null,
    [messages],
  );
  const aiSummary = latestAnalyzed?.ai_summary as string | undefined;

  // Thread-level reply answers the newest *incoming* message: after sending,
  // the newest message is our own, and replying to it would mail ourselves.
  const replyParent = useMemo(
    () => (data?.messages?.length ? pickReplyParent(data.messages) : undefined),
    [data?.messages],
  );

  // Expanded messages: only the newest by default; resets when the thread or
  // its newest message changes, otherwise keeps what the user toggled.
  const [expansionState, setExpansionState] = useState<ExpansionState | null>(null);
  const expansion = nextExpansion(expansionState, threadId, newestId);
  const toggleMessage = useCallback(
    (id: string) => setExpansionState(toggleExpanded(expansion, id)),
    [expansion],
  );

  // The view opens at the top (newest message, composer).
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollToTop = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);
  useEffect(() => {
    scrollToTop();
  }, [threadId, scrollToTop]);

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
      // Composer sits on top: bring it into view (the editor focuses itself).
      requestAnimationFrame(scrollToTop);
    },
    [data?.drafts, scrollToTop],
  );

  // After sending: our message goes on top right away, composer closes.
  const handleSent = useCallback(
    ({ message }: { messageId: string | null; message: MessageRecord }) => {
      const sentDraftId = composer?.draftId ?? null;
      qc.setQueryData<typeof data>(["thread", threadId], (old) =>
        old
          ? {
              ...old,
              messages: [message, ...old.messages.filter((m) => m.id !== message.id)],
              drafts: sentDraftId ? old.drafts.filter((d) => d.id !== sentDraftId) : old.drafts,
            }
          : old,
      );
      setComposer(null);
      scrollToTop();
    },
    [composer?.draftId, qc, threadId, scrollToTop],
  );

  const toggleMute = useCallback(async () => {
    if (!threadId) return;
    const muted = !!data?.thread?.is_muted;
    const ok = await runAction(
      () => setThreadsMuted([threadId], !muted, qc),
      t(muted ? "inbox.thread.unmutedToast" : "inbox.thread.mutedToast"),
    );
    if (ok && !muted) onAdvance?.();
  }, [data?.thread, threadId, qc, onAdvance, t]);

  // Command palette "Reply to current thread".
  useEffect(() => {
    const onReply = () => {
      if (replyParent && !composer) openComposer("reply", replyParent);
    };
    window.addEventListener("nomadix:reply", onReply);
    return () => window.removeEventListener("nomadix:reply", onReply);
  }, [replyParent, composer, openComposer]);

  const applyAiDraft = useCallback(
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
      // Second key of a "g …" sequence belongs to the global resolver.
      if (isSequencePending() || e.defaultPrevented) return;

      // Compose shortcuts (only if no composer + last message exists)
      if (!composer && replyParent) {
        if (e.key === "r" && !e.shiftKey) {
          e.preventDefault();
          openComposer("reply", replyParent);
          return;
        }
        if (e.key === "a" && e.shiftKey) {
          e.preventDefault();
          openComposer("replyAll", replyParent);
          return;
        }
        if (e.key === "f") {
          e.preventDefault();
          openComposer("forward", replyParent);
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
        await toggleMute();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [composer, replyParent, openComposer, threadId, toggleMute]);

  if (!threadId) return <NoThreadSelected />;
  if (isLoading || !data?.thread) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  const handleArchive = async () => {
    if (await runAction(() => archiveThreads([threadId], qc), t("inbox.thread.archived"))) onAdvance?.();
  };
  const handleUnarchive = async () => {
    await runAction(() => unarchiveThreads([threadId], qc), t("inbox.thread.unarchived"));
  };
  const handleDelete = async () => {
    // deleteThreads shows its own toast with an undo action.
    if (await runAction(() => deleteThreads([threadId], qc))) onAdvance?.();
  };
  const handleToggleRead = async () => {
    const anyUnread = data.messages.some((m) => !m.is_read);
    await runAction(
      () => setThreadsRead([threadId], anyUnread, qc),
      t(anyUnread ? "inbox.thread.markedRead" : "inbox.thread.markedUnread"),
    );
  };
  const handleUnsnooze = async () => {
    await runAction(() => unsnoozeThreads([threadId], qc), t("inbox.thread.unsnoozed"));
  };

  const brandId = (data.thread as any).brand_id as string | null;
  const isMuted = (data.thread as any).is_muted as boolean;
  const isArchived = (data.thread as any).is_archived as boolean;
  const snoozedUntil = (data.thread as any).snoozed_until as string | null;
  const isSnoozedNow = snoozedUntil && new Date(snoozedUntil).getTime() > Date.now();

  // AI draft for the message a reply would answer (not simply the newest —
  // that may be our own sent message).
  const aiDraftForParent = replyParent
    ? data.aiDrafts.find((d) => d.message_id === replyParent.id)
    : undefined;
  // Most recently edited draft of this thread (drafts come sorted updated_at desc).
  const resumable = (() => {
    for (const draft of data.drafts) {
      const parent = messages.find((m) => m.id === draft.in_reply_to_message_id);
      if (parent) return { draft, parent };
    }
    return null;
  })();

  return (
    <div className="flex h-full flex-col bg-background">
      {isMobile && onClose && (
        <button
          onClick={onClose}
          className="flex h-10 flex-none items-center gap-1.5 border-b border-border bg-muted/30 px-3 text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {t("inbox.thread.backToInbox")}
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
            <div className="truncate text-sm font-semibold">{data.thread.subject || t("inbox.row.noSubject")}</div>
            {isMuted && (
              <span className="flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <BellOff className="h-2.5 w-2.5" /> {t("inbox.thread.muted")}
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
        {replyParent && !composer && (
          <Button variant="outline" size="sm" className="h-8" onClick={() => openComposer("reply", replyParent)}>
            <Reply className="mr-1.5 h-3.5 w-3.5" /> {t("inbox.thread.reply")}
          </Button>
        )}
        <SnoozePicker
          threadIds={[threadId]}
          onSnoozed={onAdvance}
          trigger={
            <Button variant="ghost" size="icon" className="h-8 w-8" title={t("inbox.thread.snooze")}>
              <Clock className="h-4 w-4" />
            </Button>
          }
        />
        <LabelPicker
          threadIds={[threadId]}
          open={labelOpen}
          onOpenChange={setLabelOpen}
          trigger={
            <Button variant="ghost" size="icon" className="h-8 w-8" title={t("inbox.thread.labels")}>
              <Tag className="h-4 w-4" />
            </Button>
          }
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={toggleMute}
          title={isMuted ? t("inbox.thread.unmute") : t("inbox.thread.mute")}
        >
          {isMuted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        </Button>
        {isArchived ? (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleUnarchive} title={t("inbox.thread.unarchive")}>
            <ArchiveRestore className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleArchive} title={t("inbox.thread.archive")}>
            <Archive className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleToggleRead} title={t("inbox.thread.toggleRead")}>
          {data.messages.some((m) => !m.is_read) ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDelete} title={t("inbox.thread.delete")}>
          <Trash2 className="h-4 w-4" />
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
            {t("inbox.thread.snoozedUntil")}{" "}
            <span className="font-medium text-foreground">
              {fmtDateTime(snoozedUntil!, locale)}
            </span>{" "}
            ({fmtDistance(snoozedUntil!, locale)})
          </div>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleUnsnooze}>
            {t("inbox.thread.unsnooze")}
          </Button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {/* Decision A: everything you act on sits on top — composer, AI draft,
            resumable draft — followed by the messages, newest first. */}
        {composer && (
          <div className="mb-3">
            <ReplyComposer
              key={`${composer.parent.id}:${composer.mode}:${composer.draftId ?? "new"}`}
              threadId={threadId}
              brandId={brandId}
              parentMessage={composer.parent}
              mode={composer.mode}
              draftId={composer.draftId}
              initialDraft={composer.initialDraft}
              aiSeed={composer.aiSeed}
              onCancel={() => setComposer(null)}
              onSent={handleSent}
            />
          </div>
        )}
        {!composer && replyParent && aiDraftForParent && (
          <div className="mb-3">
            <AiDraftCard
              draft={aiDraftForParent}
              onUse={(d) => applyAiDraft(replyParent, d)}
              onChanged={() => qc.invalidateQueries({ queryKey: ["thread", threadId] })}
            />
          </div>
        )}
        {!composer && resumable && (
          <button
            onClick={() => openComposer("reply", resumable.parent)}
            className="mb-3 flex items-center gap-2 rounded-md border border-dashed border-primary/50 bg-primary/5 px-3 py-2 text-xs text-primary transition hover:bg-primary/10"
          >
            <Reply className="h-3 w-3" />
            {t("inbox.thread.resumeDraft")} · {resumable.draft.subject || t("inbox.row.noSubject")}
          </button>
        )}
        {aiSummary ? (
          <div className="mb-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("inbox.thread.aiSummary")}
              </span>
              {latestAnalyzed?.urgency === "high" && (
                <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                  {t("inbox.row.urgent")}
                </span>
              )}
              {latestAnalyzed?.needs_reply && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  {t("inbox.thread.needsReply")}
                </span>
              )}
              {latestAnalyzed?.requires_action && !latestAnalyzed?.needs_reply && (
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
                  {t("inbox.thread.actionRequired")}
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
            {t("inbox.thread.aiSummaryPending")}
          </div>
        )}
        <div className="space-y-3">
          {messages.map((m, i) => (
            <MessageCard
              key={m.id}
              message={m}
              attachments={data.attachments.filter((a) => a.message_id === m.id)}
              brandName={(data.thread!.brand as any)?.name}
              expanded={expansion.ids.has(m.id)}
              onToggle={() => toggleMessage(m.id)}
              isNewest={i === 0}
              onCompose={!composer ? openComposer : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
