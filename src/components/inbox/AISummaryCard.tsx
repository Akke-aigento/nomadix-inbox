import { motion } from "framer-motion";
import { AlertTriangle, MessageSquareReply, Sparkles, Activity } from "lucide-react";
import { duration, ease, stagger } from "@/lib/motion";

interface Props {
  summary: string;
  urgency?: string | null;
  needsReply?: boolean | null;
  requiresAction?: boolean | null;
  senderType?: string | null;
  generatedAt?: string | null;
  model?: string | null;
}

/**
 * Hero AI summary card.
 * Fraunces italic body that reveals line-by-line.
 * Subtle teal gradient on the top-left edge.
 */
export function AISummaryCard({
  summary,
  urgency,
  needsReply,
  requiresAction,
  senderType,
}: Props) {
  // Split the summary into sentences/lines so we can stagger them.
  const lines = splitForStagger(summary);
  const showSenderType =
    senderType && senderType !== "human" && senderType !== "unknown";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.standard, ease: ease.out }}
      className="relative mb-4 overflow-hidden rounded-lg bg-surface-2"
      style={{
        boxShadow: "var(--elev-1)",
      }}
    >
      {/* top-left teal gradient haze */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-24"
        style={{
          background:
            "linear-gradient(180deg, hsl(var(--accent-teal) / 0.06) 0%, transparent 100%)",
        }}
      />
      {/* left vertical gradient line */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-full w-[2px]"
        style={{
          background:
            "linear-gradient(180deg, hsl(var(--accent-teal)) 0%, hsl(var(--accent-teal) / 0) 100%)",
        }}
      />

      <div className="relative px-5 py-4">
        <div className="mb-3 flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex h-5 w-5 items-center justify-center rounded-full"
            style={{
              background: "hsl(var(--accent-teal) / 0.14)",
              color: "hsl(var(--accent-teal))",
            }}
          >
            <Activity className="h-3 w-3 animate-breathe" strokeWidth={2.25} />
          </span>
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-text-tertiary">
            Summary
          </span>

          {/* Pills */}
          <div className="ml-auto flex items-center gap-1.5">
            {urgency === "high" && (
              <Pill tone="danger" icon={<AlertTriangle className="h-2.5 w-2.5" />}>
                Urgent
              </Pill>
            )}
            {needsReply && (
              <Pill tone="teal" icon={<MessageSquareReply className="h-2.5 w-2.5" />}>
                Needs reply
              </Pill>
            )}
            {requiresAction && !needsReply && (
              <Pill tone="warning" icon={<Sparkles className="h-2.5 w-2.5" />}>
                Action
              </Pill>
            )}
            {showSenderType && (
              <Pill tone="muted">{String(senderType).toUpperCase()}</Pill>
            )}
          </div>
        </div>

        <div
          className="font-display text-text-primary"
          style={{
            fontStyle: "italic",
            fontSize: "1.05rem",
            lineHeight: 1.5,
            letterSpacing: "-0.015em",
            fontVariationSettings: '"opsz" 32, "wght" 400',
          }}
        >
          {lines.map((line, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: duration.standard,
                ease: ease.out,
                delay: 0.15 + i * stagger.normal * 1.2,
              }}
              className="block"
            >
              {line}
            </motion.span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ── Pending placeholder, used while analysis runs ── */
export function AISummaryPending() {
  return (
    <div className="mb-4 rounded-lg border border-dashed border-subtle px-5 py-4 type-ui-sm text-text-tertiary">
      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em]">
        Summary
      </span>
      <div className="mt-2 font-display italic text-text-secondary" style={{ fontSize: "0.95rem" }}>
        Reading the message…
      </div>
    </div>
  );
}

function Pill({
  tone,
  icon,
  children,
}: {
  tone: "danger" | "warning" | "teal" | "muted";
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const styles: Record<typeof tone, string> = {
    danger: "bg-destructive/14 text-destructive",
    warning: "bg-warning/16 text-warning",
    teal: "",
    muted: "bg-surface-3 text-text-secondary",
  };
  const inline =
    tone === "teal"
      ? {
          background: "hsl(var(--accent-teal) / 0.14)",
          color: "hsl(var(--accent-teal))",
        }
      : undefined;
  return (
    <span
      className={`flex items-center gap-1 rounded-md px-1.5 py-[2px] font-mono text-[10px] font-semibold uppercase tracking-[0.06em] ${styles[tone]}`}
      style={inline}
    >
      {icon}
      {children}
    </span>
  );
}

function splitForStagger(text: string): string[] {
  // Split on sentence boundaries, keep the punctuation; cap at 6 lines.
  const parts = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z“"„])/);
  return parts.slice(0, 6);
}
