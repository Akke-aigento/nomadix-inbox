import { ArrowDownNarrowWide, Rows3, Rows2, Minus, Filter as FilterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useInboxFilters, type SortKind } from "@/hooks/useInboxFilters";
import type { Density } from "./ThreadRow";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import type { MessageKey } from "@/i18n/nl";

const SORT_KEYS: Record<SortKind, MessageKey> = {
  newest: "inbox.toolbar.sortNewest",
  oldest: "inbox.toolbar.sortOldest",
  unread: "inbox.toolbar.sortUnread",
  "most-replies": "inbox.toolbar.sortMostReplies",
};

interface Props {
  density: Density;
  setDensity: (d: Density) => void;
  total: number;
  selectedCount: number;
}

export function InboxToolbar({ density, setDensity, total, selectedCount }: Props) {
  const t = useT();
  const { filters, update, activeChipCount } = useInboxFilters();

  const cycleDensity = () => {
    const next: Density =
      density === "comfortable" ? "compact" : density === "compact" ? "dense" : "comfortable";
    setDensity(next);
  };

  const DensityIcon = density === "comfortable" ? Rows3 : density === "compact" ? Rows2 : Minus;

  return (
    <div className="flex h-9 items-center justify-between border-b border-border/60 px-3 text-xs">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="tabular-nums">{t("inbox.toolbar.threads", { count: total })}</span>
        {selectedCount > 0 && (
          <span className="text-foreground/80">
            · {t("inbox.toolbar.selected", { count: selectedCount })}
          </span>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        {/* Filter popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-7 w-7", activeChipCount > 0 && "text-primary")}
              aria-label={t("inbox.toolbar.filters")}
            >
              <FilterIcon className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-3">
            <div className="space-y-3 text-sm">
              <div>
                <Label className="text-2xs uppercase tracking-wider text-muted-foreground">
                  {t("inbox.toolbar.state")}
                </Label>
                <div className="mt-1 grid grid-cols-3 gap-1">
                  {(["all", "unread", "read"] as const).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={filters.state === s ? "default" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => update({ state: s })}
                    >
                      {s === "all"
                        ? t("inbox.toolbar.stateAll")
                        : s === "unread"
                          ? t("inbox.toolbar.stateUnread")
                          : t("inbox.toolbar.stateRead")}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="attach" className="text-xs font-normal">
                  {t("inbox.toolbar.hasAttachment")}
                </Label>
                <Switch
                  id="attach"
                  checked={filters.hasAttachments}
                  onCheckedChange={(v) => update({ hasAttachments: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="urgent" className="text-xs font-normal">
                  {t("inbox.toolbar.urgentOnly")}
                </Label>
                <Switch
                  id="urgent"
                  checked={filters.urgency === "high"}
                  onCheckedChange={(v) => update({ urgency: v ? "high" : "any" })}
                />
              </div>
              <div>
                <Label className="text-2xs uppercase tracking-wider text-muted-foreground">
                  {t("inbox.toolbar.dateRange")}
                </Label>
                <div className="mt-1 grid grid-cols-3 gap-1">
                  {(["7d", "30d", "all"] as const).map((r) => (
                    <Button
                      key={r}
                      size="sm"
                      variant={filters.dateRange === r ? "default" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => update({ dateRange: r })}
                    >
                      {r === "7d"
                        ? t("inbox.toolbar.range7d")
                        : r === "30d"
                          ? t("inbox.toolbar.range30d")
                          : t("inbox.toolbar.rangeAll")}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Sort */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t("inbox.toolbar.sort")}>
              <ArrowDownNarrowWide className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-2xs uppercase tracking-wider">
              {t("inbox.toolbar.sortBy")}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={filters.sort}
              onValueChange={(v) => update({ sort: v as SortKind })}
            >
              {(Object.keys(SORT_KEYS) as SortKind[]).map((k) => (
                <DropdownMenuRadioItem key={k} value={k} className="text-xs">
                  {t(SORT_KEYS[k])}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Density */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={cycleDensity}
          title={t("inbox.toolbar.density", {
            value: t(`prefs.density.${density}` as MessageKey),
          })}
          aria-label={t("inbox.toolbar.densityToggle")}
        >
          <DensityIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
