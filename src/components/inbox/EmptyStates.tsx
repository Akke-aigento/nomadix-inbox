import { Inbox, Search, MailOpen, Filter, Sparkles, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInboxFilters } from "@/hooks/useInboxFilters";
import { useT } from "@/i18n";

export function EmptyInbox() {
  const t = useT();
  const { filters } = useInboxFilters();
  if (filters.view === "archive") {
    return (
      <Wrapper
        icon={<Archive className="h-6 w-6" />}
        title={t("inbox.empty.archiveTitle")}
        body={t("inbox.empty.archiveBody")}
      />
    );
  }
  if (filters.view === "needs-reply") {
    return (
      <Wrapper
        icon={<Sparkles className="h-6 w-6" />}
        title={t("inbox.empty.needsReplyTitle")}
        body={t("inbox.empty.needsReplyBody")}
      />
    );
  }
  return (
    <Wrapper
      icon={<MailOpen className="h-6 w-6" />}
      title={t("inbox.empty.zeroTitle")}
      body={t("inbox.empty.zeroBody")}
    />
  );
}

export function NoResults() {
  const t = useT();
  const { filters, reset, update, activeChipCount } = useInboxFilters();

  if (filters.search) {
    return (
      <Wrapper
        icon={<Search className="h-6 w-6" />}
        title={t("inbox.empty.noResultsTitle", { query: filters.search })}
        body={t("inbox.empty.noResultsBody")}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => update({ search: "" })}>
              {t("inbox.empty.clearSearch")}
            </Button>
            {activeChipCount > 0 && (
              <Button variant="ghost" size="sm" onClick={reset}>
                {t("inbox.empty.clearFilters")}
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
      title={t("inbox.empty.noMatchTitle")}
      body={t("inbox.empty.noMatchBody")}
      action={
        <Button variant="outline" size="sm" onClick={reset}>
          {t("inbox.empty.clearFilters")}
        </Button>
      }
    />
  );
}

export function NoThreadSelected() {
  const t = useT();
  return (
    <Wrapper
      className="h-full"
      icon={<Inbox className="h-6 w-6" />}
      title={t("inbox.empty.selectTitle")}
      body={
        <>
          {t("inbox.empty.selectHintPress")}{" "}
          <kbd className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-xs">
            j
          </kbd>{" "}
          {t("inbox.empty.selectHintFocus")}{" "}
          <kbd className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-xs">
            o
          </kbd>{" "}
          {t("inbox.empty.selectHintOpen")}{" "}
          <kbd className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-xs">
            ⌘K
          </kbd>{" "}
          {t("inbox.empty.selectHintPalette")}
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
