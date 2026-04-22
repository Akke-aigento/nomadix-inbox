import { Inbox, Search, MailOpen, Filter, Sparkles, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInboxFilters } from "@/hooks/useInboxFilters";

export function EmptyInbox() {
  const { filters } = useInboxFilters();
  if (filters.view === "archive") {
    return (
      <Wrapper
        icon={<Archive className="h-6 w-6" />}
        title="Archive is empty"
        body="Threads you archive show up here."
      />
    );
  }
  if (filters.view === "needs-reply") {
    return (
      <Wrapper
        icon={<Sparkles className="h-6 w-6" />}
        title="Nothing waiting on you"
        body="The AI hasn't flagged anything as needing a reply right now."
      />
    );
  }
  return (
    <Wrapper
      icon={<MailOpen className="h-6 w-6" />}
      title="Inbox Zero — nice work."
      body="Nothing left to read. Triage achieved 🎉"
    />
  );
}

export function NoResults() {
  const { filters, reset, update, activeChipCount } = useInboxFilters();

  if (filters.search) {
    return (
      <Wrapper
        icon={<Search className="h-6 w-6" />}
        title={`No results for "${filters.search}"`}
        body="Try a different keyword, or remove your active filters."
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => update({ search: "" })}>
              Clear search
            </Button>
            {activeChipCount > 0 && (
              <Button variant="ghost" size="sm" onClick={reset}>
                Clear all filters
              </Button>
            )}
          </div>
        }
      />
    );
  }

  return (
    <Wrapper
      icon={<Filter className="h-6 w-6" />}
      title="No mail matches these filters"
      body="Loosen up your filters or start fresh."
      action={
        <Button variant="outline" size="sm" onClick={reset}>
          Clear all filters
        </Button>
      }
    />
  );
}

export function NoThreadSelected() {
  return (
    <Wrapper
      className="h-full"
      icon={<Inbox className="h-6 w-6" />}
      title="Select a thread to read"
      body={
        <>
          Press{" "}
          <kbd className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-xs">
            j
          </kbd>{" "}
          to focus the first thread, then{" "}
          <kbd className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-xs">
            o
          </kbd>{" "}
          to open it. Or hit{" "}
          <kbd className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-xs">
            ⌘K
          </kbd>{" "}
          for the command palette.
        </>
      }
    />
  );
}

function Wrapper({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 p-8 text-center ${className ?? ""}`}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/40 text-muted-foreground">
        {icon}
      </div>
      <div className="text-base font-medium tracking-tight">{title}</div>
      <div className="max-w-xs text-sm text-muted-foreground">{body}</div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
