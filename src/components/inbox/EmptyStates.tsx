import { Inbox, Search, MailOpen } from "lucide-react";

export function EmptyInbox() {
  return (
    <div className="flex flex-col items-center gap-3 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/40 text-muted-foreground">
        <MailOpen className="h-6 w-6" />
      </div>
      <div className="text-base font-medium tracking-tight">Inbox Zero — nice work.</div>
      <div className="max-w-xs text-sm text-muted-foreground">
        Nothing left to read. Triage achieved.
      </div>
    </div>
  );
}

export function NoResults() {
  return (
    <div className="flex flex-col items-center gap-3 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/40 text-muted-foreground">
        <Search className="h-6 w-6" />
      </div>
      <div className="text-base font-medium tracking-tight">No mail matches these filters</div>
      <div className="max-w-xs text-sm text-muted-foreground">
        Try clearing the search or removing one of the filters.
      </div>
    </div>
  );
}

export function NoThreadSelected() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/30 text-muted-foreground">
        <Inbox className="h-6 w-6" />
      </div>
      <div className="text-base font-medium tracking-tight">Select a thread to read</div>
      <div className="max-w-xs text-sm text-muted-foreground">
        Press{" "}
        <kbd className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-xs">j</kbd>{" "}
        to focus the first thread, then{" "}
        <kbd className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-xs">o</kbd>{" "}
        to open it.
      </div>
    </div>
  );
}
