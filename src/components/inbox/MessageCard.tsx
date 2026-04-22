import { useState, useMemo } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Reply, ReplyAll, Forward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sanitizeEmailHtml } from "@/lib/sanitize";
import { AttachmentList, type AttachmentRow } from "./AttachmentPreview";
import { cn } from "@/lib/utils";
import { gradientFromSeed, initials as initialsFromSeed } from "@/lib/theme";
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
  is_read: boolean;
}

function initials(name: string | null, email: string) {
  return initialsFromSeed(name, email);
}

function foldQuoted(html: string): string {
  return html
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, (m) => `<details class="quoted"><summary>Show quoted text</summary>${m}</details>`)
    .replace(/(<div[^>]*gmail_quote[\s\S]*?<\/div>)/gi, (m) => `<details class="quoted"><summary>Show quoted text</summary>${m}</details>`);
}

interface Props {
  message: MessageRecord;
  attachments: AttachmentRow[];
  brandName?: string;
  defaultExpanded: boolean;
  isLast: boolean;
  onCompose?: (mode: ComposeMode, message: MessageRecord) => void;
}

export function MessageCard({ message, attachments, brandName, defaultExpanded, isLast, onCompose }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const html = useMemo(() => {
    if (message.body_html) return sanitizeEmailHtml(foldQuoted(message.body_html));
    if (message.body_text) return `<pre class="whitespace-pre-wrap font-sans text-sm">${message.body_text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!))}</pre>`;
    return "";
  }, [message.body_html, message.body_text]);

  const previewLine = (message.body_text || "").replace(/\s+/g, " ").trim().slice(0, 120);
  const date = new Date(message.received_at);

  return (
    <div className={cn("border border-subtle bg-surface-1 rounded-lg", isLast && "elev-1")}>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-start gap-3 p-4 text-left"
        aria-expanded={expanded}
      >
        <span
          aria-hidden
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full font-mono text-[11px] font-semibold uppercase tracking-wider text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
          style={{ backgroundImage: gradientFromSeed(message.from_address || message.from_name || "?") }}
        >
          {initials(message.from_name, message.from_address)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold">{message.from_name || message.from_address}</span>
            {message.from_name && (
              <span className="truncate text-xs text-muted-foreground">&lt;{message.from_address}&gt;</span>
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
          {isLast && onCompose && (
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
