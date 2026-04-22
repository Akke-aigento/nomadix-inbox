import { memo } from "react";
import { formatDistanceToNowStrict, format, isToday, isYesterday } from "date-fns";
import { Paperclip, AlertTriangle, MessageSquareReply, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThreadRow } from "@/hooks/useThreadsQuery";
import { Checkbox } from "@/components/ui/checkbox";
import { brandAccentStyle, toHslTriplet } from "@/lib/theme";

export type Density = "comfortable" | "compact" | "dense";

const HEIGHT: Record<Density, number> = {
  comfortable: 88,
  compact: 60,
  dense: 36,
};

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isToday(d))
    return formatDistanceToNowStrict(d)
      .replace(" minutes", "m")
      .replace(" minute", "m")
      .replace(" hours", "h")
      .replace(" hour", "h")
      .replace(" seconds", "s")
      .replace(" second", "s");
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

function prettyCategory(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
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

function ThreadRowImpl({
  thread,
  density,
  selected,
  focused,
  active,
  isUnread,
  onClick,
  onToggleSelect,
  style,
}: Props) {
  const brandColor = thread.brand?.color_primary;
  const brandHsl = toHslTriplet(brandColor);
  const brandStyle = brandAccentStyle(brandColor);
  const m = thread.latest_message;
  const preview = (m?.body_text || thread.preview || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 130);
  const time = relativeTime(thread.last_message_at);
  const isUrgent = m?.urgency === "high" || m?.urgency === "urgent";
  const needsReply = !!m?.needs_reply;
  const showChips = density !== "dense";

  return (
    <div
      style={{ ...brandStyle, ...style, height: HEIGHT[density] }}
      onClick={onClick}
      className={cn(
        "group relative flex cursor-pointer items-stretch gap-3 border-b border-subtle pl-4 pr-4 transition-colors",
        active ? "bg-surface-active" : "hover:bg-surface-hover",
        focused && !active && "ring-1 ring-inset ring-brand/40",
        density === "comfortable" ? "py-2" : density === "compact" ? "py-1.5" : "py-1",
      )}
    >
      {/* Brand accent bar */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-0 h-full transition-all",
          active || isUnread ? "w-[3px] opacity-100" : "w-[3px] opacity-50",
          "group-hover:w-[4px] group-hover:opacity-100",
        )}
        style={{
          background: brandHsl ? `hsl(${brandHsl})` : "hsl(var(--text-disabled))",
        }}
      />

      {/* Checkbox */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect();
        }}
        className={cn(
          "z-10 flex h-5 w-5 flex-none items-center justify-center self-center",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      >
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label="Select thread" />
      </div>

      {/* Content */}
      <div className="z-10 flex min-w-0 flex-1 flex-col justify-center">
        {density === "dense" ? (
          <div className="flex items-center gap-2 type-ui-sm">
            {thread.brand && (
              <span
                className="flex-none rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider"
                style={{
                  background: "hsl(var(--brand-accent) / 0.14)",
                  color: "hsl(var(--brand-accent))",
                }}
              >
                {thread.brand.name}
              </span>
            )}
            <span
              className={cn(
                "min-w-0 max-w-[160px] truncate",
                isUnread ? "font-semibold text-text-primary" : "text-text-tertiary",
              )}
            >
              {senderName(thread)}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                isUnread ? "text-text-primary" : "text-text-secondary",
              )}
            >
              {thread.subject || "(no subject)"}
            </span>
          </div>
        ) : (
          <>
            {/* Top line: sender · subject · time */}
            <div className="flex items-baseline gap-2">
              {/* Unread dot */}
              {isUnread && (
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 flex-none rounded-full"
                  style={{ background: "hsl(var(--brand-accent))" }}
                />
              )}
              <span
                className={cn(
                  "min-w-0 truncate type-ui-md",
                  isUnread ? "font-semibold text-text-primary" : "text-text-secondary",
                  density === "comfortable" ? "max-w-[200px]" : "max-w-[160px]",
                )}
              >
                {senderName(thread)}
              </span>
              {thread.message_count > 1 && (
                <span className="rounded-sm bg-surface-2 px-1 font-mono text-[10px] tabular-nums text-text-tertiary">
                  {thread.message_count}
                </span>
              )}
              <span
                className={cn(
                  "min-w-0 flex-1 truncate type-ui-md",
                  isUnread ? "font-medium text-text-primary" : "text-text-secondary",
                )}
              >
                {thread.subject || "(no subject)"}
              </span>
              <span
                className={cn(
                  "ml-2 flex-none font-mono text-[11px] tabular-nums",
                  isUnread ? "text-text-secondary" : "text-text-tertiary",
                )}
              >
                {time}
              </span>
            </div>

            {/* Bottom line: preview + chips */}
            {showChips && (
              <div className="mt-1 flex items-center gap-1.5">
                {thread.brand && (
                  <span
                    className="flex flex-none items-center gap-1 rounded-md px-1.5 py-[2px] font-mono text-[10px] font-medium uppercase tracking-[0.06em]"
                    style={{
                      background: "hsl(var(--brand-accent) / 0.12)",
                      color: "hsl(var(--brand-accent))",
                    }}
                  >
                    {thread.brand.name}
                  </span>
                )}
                {m?.ai_category && (
                  <span className="flex flex-none items-center gap-1 rounded-md bg-surface-2 px-1.5 py-[2px] font-mono text-[10px] font-medium text-text-secondary">
                    <Sparkles className="h-2.5 w-2.5" strokeWidth={2} />
                    {prettyCategory(m.ai_category)}
                  </span>
                )}
                {isUrgent && (
                  <span className="flex flex-none items-center gap-1 rounded-md bg-destructive/12 px-1.5 py-[2px] font-mono text-[10px] font-semibold uppercase tracking-wider text-destructive">
                    <AlertTriangle className="h-2.5 w-2.5" strokeWidth={2} />
                    Urgent
                  </span>
                )}
                {needsReply && (
                  <span
                    className="flex flex-none items-center gap-1 rounded-md px-1.5 py-[2px] font-mono text-[10px] font-semibold uppercase tracking-wider"
                    style={{
                      background: "hsl(var(--accent-teal) / 0.14)",
                      color: "hsl(var(--accent-teal))",
                    }}
                  >
                    <MessageSquareReply className="h-2.5 w-2.5" strokeWidth={2} />
                    Reply
                  </span>
                )}
                {thread.has_attachments && (
                  <Paperclip className="h-3 w-3 flex-none text-text-tertiary" strokeWidth={1.75} />
                )}
                {density === "comfortable" && preview && (
                  <span className="ml-1 min-w-0 flex-1 truncate type-ui-sm text-text-tertiary">
                    {preview}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export const ThreadRowItem = memo(ThreadRowImpl);
export const THREAD_ROW_HEIGHT = HEIGHT;
