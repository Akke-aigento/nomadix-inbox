import { memo } from "react";
import { formatDistanceToNowStrict, format, isToday, isYesterday } from "date-fns";
import { Paperclip, AlertTriangle, MessageSquareReply } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThreadRow } from "@/hooks/useThreadsQuery";
import { Checkbox } from "@/components/ui/checkbox";

export type Density = "comfortable" | "compact" | "dense";

const HEIGHT: Record<Density, number> = {
  comfortable: 76,
  compact: 52,
  dense: 36,
};

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isToday(d)) return formatDistanceToNowStrict(d).replace(" minutes", "m").replace(" minute", "m").replace(" hours", "h").replace(" hour", "h").replace(" seconds", "s").replace(" second", "s");
  if (isYesterday(d)) return "Yesterday";
  const days = (Date.now() - d.getTime()) / 86400000;
  if (days < 7) return format(d, "EEE");
  return format(d, "MMM d");
}

function senderName(thread: ThreadRow): string {
  const m = thread.latest_message;
  if (m?.from_name) return m.from_name;
  if (m?.from_address) return m.from_address.split("@")[0];
  if (Array.isArray(thread.participants) && thread.participants[0])
    return String(thread.participants[0]).replace(/<.*>/, "").trim() || String(thread.participants[0]);
  return "(Unknown)";
}

interface Props {
  thread: ThreadRow;
  density: Density;
  selected: boolean;
  focused: boolean;
  active: boolean;
  isUnread: boolean;
  onClick: () => void;
  onToggleSelect: () => void;
  style?: React.CSSProperties;
}

function ThreadRowImpl({ thread, density, selected, focused, active, isUnread, onClick, onToggleSelect, style }: Props) {
  const accent = thread.brand?.color_primary || "#64748B";
  const m = thread.latest_message;
  const preview = (m?.body_text || thread.preview || "").replace(/\s+/g, " ").trim().slice(0, 110);
  const time = relativeTime(thread.last_message_at);
  const showCategoryPill = density !== "dense" && m?.ai_category;

  return (
    <div
      style={{ ...style, height: HEIGHT[density] }}
      onClick={onClick}
      className={cn(
        "group relative flex cursor-pointer items-center gap-3 border-b border-border/50 pl-3 pr-4 transition-colors",
        active ? "bg-primary/5" : "hover:bg-muted/40",
        focused && !active && "ring-1 ring-inset ring-primary/40",
        density === "comfortable" ? "py-2" : density === "compact" ? "py-1.5" : "py-1",
      )}
    >
      {/* Brand color bar */}
      <span
        className={cn("absolute left-0 top-0 h-full w-[3px]", active ? "opacity-100" : isUnread ? "opacity-90" : "opacity-50")}
        style={{ background: accent }}
      />
      {/* Unread tint */}
      {isUnread && !active && (
        <span className="pointer-events-none absolute inset-0" style={{ background: `${accent}10` }} />
      )}

      {/* Checkbox */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect();
        }}
        className={cn(
          "z-10 flex h-5 w-5 flex-none items-center justify-center",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      >
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label="Select thread" />
      </div>

      {/* Content */}
      <div className="z-10 flex min-w-0 flex-1 flex-col justify-center">
        {density === "dense" ? (
          <div className="flex items-center gap-2 text-sm">
            <span className={cn("min-w-0 max-w-[140px] truncate", isUnread ? "font-semibold" : "text-muted-foreground")}>
              {senderName(thread)}
            </span>
            <span className={cn("min-w-0 flex-1 truncate", isUnread ? "font-medium text-foreground" : "text-muted-foreground")}>
              {thread.subject || "(no subject)"}
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "min-w-0 truncate text-sm",
                  isUnread ? "font-semibold text-foreground" : "text-foreground/90",
                  density === "comfortable" ? "max-w-[180px]" : "max-w-[140px]",
                )}
              >
                {senderName(thread)}
              </span>
              {thread.message_count > 1 && (
                <span className="rounded-sm bg-muted/60 px-1 text-[10px] text-muted-foreground">
                  {thread.message_count}
                </span>
              )}
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  isUnread ? "font-medium text-foreground" : "text-foreground/80",
                )}
              >
                {thread.subject || "(no subject)"}
              </span>
            </div>
            {density === "comfortable" && (
              <div className="mt-0.5 flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{preview}</span>
                {showCategoryPill && (
                  <span
                    className="flex-none rounded-full px-1.5 py-0.5 text-[10px] text-foreground/80"
                    style={{ background: `${accent}20`, color: accent }}
                  >
                    {m!.ai_category}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Right: indicators + time */}
      <div className="z-10 flex flex-none flex-col items-end justify-center gap-0.5">
        <span className={cn("text-[11px]", isUnread ? "font-medium text-foreground" : "text-muted-foreground")}>{time}</span>
        <div className="flex items-center gap-1 text-muted-foreground">
          {thread.has_attachments && <Paperclip className="h-3 w-3" />}
          {(m?.urgency === "high" || m?.urgency === "urgent") && <AlertTriangle className="h-3 w-3 text-warning" />}
          {m?.needs_reply && <MessageSquareReply className="h-3 w-3 text-primary" />}
        </div>
      </div>
    </div>
  );
}

export const ThreadRowItem = memo(ThreadRowImpl);
export const THREAD_ROW_HEIGHT = HEIGHT;
