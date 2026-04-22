import { motion } from "framer-motion";
import { Inbox, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInboxFilters } from "@/hooks/useInboxFilters";
import { duration, ease } from "@/lib/motion";

/* Hero empty state — Inbox Zero */
export function EmptyInbox() {
  const { filters } = useInboxFilters();

  if (filters.view === "archive") {
    return (
      <Hero
        title="The archive sleeps."
        body="Threads you archive land here, quietly."
      />
    );
  }
  if (filters.view === "needs-reply") {
    return (
      <Hero
        title="Nothing waiting on you."
        body="The AI hasn't flagged anything as needing a reply right now."
      />
    );
  }
  if (filters.view === "snoozed") {
    return (
      <Hero
        title="No snoozes pending."
        body="When you snooze a thread, it'll wake up and reappear here first."
      />
    );
  }

  return (
    <Hero
      title="Inbox Zero."
      body="Go do something meaningful."
      action={
        <Button
          variant="outline"
          className="border-strong bg-transparent text-text-primary hover:border-brand hover:bg-brand/8 hover:text-brand"
        >
          Compose
        </Button>
      }
    />
  );
}

/* Search / filter empty state */
export function NoResults() {
  const { filters, reset, update, activeChipCount } = useInboxFilters();

  if (filters.search) {
    return (
      <Hero
        small
        title={`No results for "${filters.search}"`}
        titleClassName="not-italic font-display text-text-primary"
        body="Try a different keyword, or remove your active filters."
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => update({ search: "" })}
              className="border-strong bg-transparent text-text-secondary hover:border-brand hover:text-brand"
            >
              Clear search
            </Button>
            {activeChipCount > 0 && (
              <Button variant="ghost" size="sm" onClick={reset} className="text-text-tertiary">
                Clear all filters
              </Button>
            )}
          </div>
        }
      />
    );
  }

  return (
    <Hero
      small
      title="Nothing. Anywhere."
      body="Loosen up the filters or start fresh."
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={reset}
          className="border-strong bg-transparent text-text-secondary hover:border-brand hover:text-brand"
        >
          Clear all filters
        </Button>
      }
    />
  );
}

export function NoThreadSelected() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <Inbox className="h-6 w-6 text-text-disabled" strokeWidth={1.5} />
      <div className="font-display italic text-text-secondary" style={{ fontSize: "1.5rem" }}>
        Select a thread to read.
      </div>
      <div className="max-w-sm type-ui-sm text-text-tertiary">
        Press{" "}
        <Kbd>j</Kbd> to focus the first thread, then <Kbd>o</Kbd> to open it. Hit{" "}
        <Kbd>⌘K</Kbd> for the command palette.
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-flex h-5 items-center rounded border border-subtle bg-surface-2 px-1.5 font-mono text-[11px] text-text-secondary">
      {children}
    </kbd>
  );
}

function Hero({
  title,
  body,
  action,
  small = false,
  titleClassName,
}: {
  title: string;
  body: React.ReactNode;
  action?: React.ReactNode;
  small?: boolean;
  titleClassName?: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-8 text-center">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.hero, ease: ease.out, delay: 0.1 }}
        className={
          titleClassName ??
          "font-display italic text-text-primary"
        }
        style={{
          fontSize: small ? "2rem" : "clamp(2.5rem, 6vw, 3.5rem)",
          lineHeight: 1.05,
          letterSpacing: "-0.035em",
          fontVariationSettings: '"opsz" 144, "wght" 400',
        }}
      >
        {title}
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.hero, ease: ease.out, delay: 0.2 }}
        className="max-w-md type-ui-md text-text-tertiary"
      >
        {body}
      </motion.div>
      {action && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.standard, ease: ease.out, delay: 0.3 }}
        >
          {action}
        </motion.div>
      )}
      {/* secondary search hint — keep search icon for affordance only on small variant */}
      {small && (
        <Search className="hidden text-text-disabled" strokeWidth={1.5} />
      )}
    </div>
  );
}
