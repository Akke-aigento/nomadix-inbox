import { useMemo, useState } from "react";
import { Tag, Plus, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLabelsQuery, useThreadLabels } from "@/hooks/useLabelsQuery";
import { addLabelToThreads, removeLabelFromThreads } from "@/lib/inbox-actions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  threadIds: string[];
  trigger?: React.ReactNode;
  align?: "start" | "center" | "end";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function LabelPicker({ threadIds, trigger, align = "end", open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const { data: labels = [] } = useLabelsQuery();
  const { data: threadLabelsMap = {} } = useThreadLabels(threadIds);

  // Compute which labels are applied to ALL selected threads vs SOME
  const appliedState = useMemo(() => {
    const result: Record<string, "all" | "some" | "none"> = {};
    for (const label of labels) {
      let count = 0;
      for (const tid of threadIds) {
        if ((threadLabelsMap[tid] || []).includes(label.id)) count++;
      }
      if (count === 0) result[label.id] = "none";
      else if (count === threadIds.length) result[label.id] = "all";
      else result[label.id] = "some";
    }
    return result;
  }, [labels, threadIds, threadLabelsMap]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return labels;
    return labels.filter((l) => l.name.toLowerCase().includes(q));
  }, [labels, search]);

  const exactMatch = useMemo(
    () => labels.some((l) => l.name.toLowerCase() === search.trim().toLowerCase()),
    [labels, search],
  );

  const toggle = async (labelId: string) => {
    const state = appliedState[labelId];
    if (state === "all") {
      await removeLabelFromThreads(threadIds, labelId, qc);
    } else {
      await addLabelToThreads(threadIds, labelId, qc);
    }
  };

  const createLabel = async () => {
    const name = search.trim();
    if (!name) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("labels")
      .insert({ name, color: randomColor() })
      .select("id")
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error("Could not create label");
      return;
    }
    await addLabelToThreads(threadIds, data.id, qc);
    qc.invalidateQueries({ queryKey: ["labels"] });
    setSearch("");
    toast.success(`Label "${name}" toegevoegd`);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Labels (v)">
            <Tag className="h-4 w-4" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-2">
        <Input
          placeholder="Zoek of maak label…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          className="h-8 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && search.trim() && !exactMatch && !creating) {
              e.preventDefault();
              createLabel();
            }
          }}
        />
        <div className="mt-2 max-h-60 overflow-y-auto">
          {filtered.length === 0 && !search.trim() && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              Nog geen labels
            </div>
          )}
          {filtered.map((label) => {
            const state = appliedState[label.id];
            return (
              <button
                key={label.id}
                onClick={() => toggle(label.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                )}
              >
                <span
                  className="block h-2.5 w-2.5 flex-none rounded-sm"
                  style={{ background: label.color }}
                />
                <span className="flex-1 truncate">{label.name}</span>
                {state === "all" && <Check className="h-3.5 w-3.5 text-primary" />}
                {state === "some" && (
                  <span className="block h-3 w-3 rounded-sm border border-primary bg-primary/30" />
                )}
              </button>
            );
          })}
          {search.trim() && !exactMatch && (
            <button
              onClick={createLabel}
              disabled={creating}
              className="mt-1 flex w-full items-center gap-2 rounded-md border border-dashed border-border px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
              Maak label "<span className="font-medium text-foreground">{search.trim()}</span>"
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function randomColor(): string {
  const palette = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"];
  return palette[Math.floor(Math.random() * palette.length)];
}
