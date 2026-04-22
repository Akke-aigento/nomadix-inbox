import { useState } from "react";
import { Clock, Calendar as CalendarIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { snoozeThreads, SNOOZE_PRESETS } from "@/lib/inbox-actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  threadIds: string[];
  trigger?: React.ReactNode;
  align?: "start" | "center" | "end";
  onSnoozed?: () => void;
}

export function SnoozePicker({ threadIds, trigger, align = "end", onSnoozed }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("09:00");

  const handlePreset = async (until: Date, label: string) => {
    if (!threadIds.length) return;
    await snoozeThreads(threadIds, until, qc);
    toast.success(`Gesnoozed tot ${format(until, "d MMM HH:mm")} (${label})`);
    setOpen(false);
    onSnoozed?.();
  };

  const handleCustom = async () => {
    if (!customDate) {
      toast.error("Kies een datum");
      return;
    }
    const dt = new Date(`${customDate}T${customTime || "09:00"}:00`);
    if (Number.isNaN(dt.getTime()) || dt.getTime() <= Date.now()) {
      toast.error("Kies een tijd in de toekomst");
      return;
    }
    await snoozeThreads(threadIds, dt, qc);
    toast.success(`Gesnoozed tot ${format(dt, "d MMM HH:mm")}`);
    setOpen(false);
    onSnoozed?.();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Snooze (b)">
            <Clock className="h-4 w-4" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-72 p-2">
        <div className="px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Snooze tot
        </div>
        <div className="space-y-0.5">
          {SNOOZE_PRESETS.map((p) => {
            const dt = p.compute();
            return (
              <button
                key={p.key}
                onClick={() => handlePreset(dt, p.label)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm text-left",
                  "hover:bg-muted",
                )}
              >
                <span>{p.label}</span>
                <span className="text-xs text-muted-foreground">
                  {format(dt, "EEE d MMM, HH:mm")}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 border-t border-border pt-2">
          <div className="mb-1.5 flex items-center gap-1.5 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <CalendarIcon className="h-3 w-3" /> Custom
          </div>
          <div className="flex gap-1.5 px-1.5">
            <Input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="h-8 flex-1 text-xs"
            />
            <Input
              type="time"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              className="h-8 w-24 text-xs"
            />
          </div>
          <div className="mt-2 flex justify-end px-1.5">
            <Button size="sm" className="h-7" onClick={handleCustom}>
              Snooze
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
