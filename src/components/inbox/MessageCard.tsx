import { useMemo } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Reply, ReplyAll, Forward } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { sanitizeEmailHtml } from "@/lib/sanitize";
import { AttachmentList, type AttachmentRow } from "./AttachmentPreview";
import { cn } from "@/lib/utils";
import { foldQuotedHtml, previewText } from "@/lib/thread-view";
import type { ComposeMode } from "./ReplyComposer";

export interface MessageRecord {
  id: string;
  from_address: string;
  from_name: string | null;
  to_addresses: any;
  cc_addresses: any;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  received_at: string;
  matched_email_address: string | null;
  reply_to?: string | null;
  is_read: boolean;
  is_outbound?: boolean | null;
}

function initials(name: string | null, email: string) {
  const src = name || email.split("@")[0];
  return src
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

interface Props {
  message: MessageRecord;
  attachments: AttachmentRow[];
  brandName?: string;
  /** Controlled by ThreadDetail: newest open, older closed, reset when a new message lands on top. */
  expanded: boolean;
  onToggle: () => void;
  isNewest: boolean;
  onCompose?: (mode: ComposeMode, message: MessageRecord) => void;
}

export function MessageCard({ message, attachments, brandName, expanded, onToggle, isNewest, onCompose }: Props) {
  const html = useMemo(() => {
    // Sanitize first, then fold: the <details> wrapper is added to clean HTML.
    if (message.body_html) return foldQuotedHtml(sanitizeEmailHtml(message.body_html));
    if (message.body_text) return `<pre class="whitespace-pre-wrap font-sans text-sm">${message.body_text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!))}</pre>`;
    return "";
  }, [message.body_html, message.body_text]);

  // Outbound messages have no body_text: preview from the HTML instead.
  const previewLine = useMemo(
    () => previewText(message.body_text, message.body_html),
    [message.body_text, message.body_html],
  );
  const date = new Date(message.received_at);

  return (
    <div className={cn("border border-border/60 bg-card rounded-lg", isNewest && "shadow-sm")}>
      <button
        onClick={onToggle}
        className="flex w-full items-start gap-3 p-4 text-left"
        aria-expanded={expanded}
      >
        <Avatar className="h-9 w-9 flex-none">
          <AvatarFallback className="bg-muted text-xs">
            {initials(message.from_name, message.from_address)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold">{message.from_name || message.from_address}</span>
            {message.from_name && (
              <span className="truncate text-xs text-muted-foreground">&lt;{message.from_address}&gt;</span>
            )}
            {message.is_outbound && (
              <span className="flex-none rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                Verzonden
              </span>
            )}
          </div>
          {expanded ? (
            <div className="mt-1 text-xs text-muted-foreground">
              to {Array.isArray(message.to_addresses) && message.to_addresses[0]?.address}
              {message.matched_email_address && (
                <>
                  {" "}
                  · received at <span className="font-medium text-foreground/80">{message.matched_email_address}</span>
                  {brandName && <> via {brandName}</>}
                </>
              )}
            </div>
          ) : (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">{previewLine}</div>
          )}
        </div>
        <div className="flex flex-none flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground">{format(date, "MMM d, HH:mm")}</span>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          <div
            className="email-body prose prose-sm prose-invert max-w-none text-sm"
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <AttachmentList attachments={attachments} />
          {onCompose && (
            <div className="mt-4 flex gap-2 border-t border-border/60 pt-3">
              <Button size="sm" variant="outline" onClick={() => onCompose("reply", message)}>
                <Reply className="mr-1.5 h-3.5 w-3.5" /> Reply
              </Button>
              <Button size="sm" variant="outline" onClick={() => onCompose("replyAll", message)}>
                <ReplyAll className="mr-1.5 h-3.5 w-3.5" /> Reply All
              </Button>
              <Button size="sm" variant="outline" onClick={() => onCompose("forward", message)}>
                <Forward className="mr-1.5 h-3.5 w-3.5" /> Forward
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
