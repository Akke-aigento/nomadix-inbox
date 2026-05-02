import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Plus, PlayCircle, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import RoutingRuleFormDialog, { type RoutingRule } from "@/components/rules/RoutingRuleFormDialog";
import RuleTestDialog from "@/components/rules/RuleTestDialog";

export default function RulesPage() {
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RoutingRule | null>(null);
  const [deleting, setDeleting] = useState<RoutingRule | null>(null);
  const [testing, setTesting] = useState<RoutingRule | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("routing_rules")
      .select("*")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setRules((data ?? []) as RoutingRule[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleActive = async (rule: RoutingRule, value: boolean) => {
    const { error } = await supabase
      .from("routing_rules")
      .update({ is_active: value })
      .eq("id", rule.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRules((rs) => rs.map((r) => (r.id === rule.id ? { ...r, is_active: value } : r)));
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rules.findIndex((r) => r.id === active.id);
    const newIndex = rules.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(rules, oldIndex, newIndex).map((r, i) => ({
      ...r,
      priority: (i + 1) * 5,
    }));
    setRules(next);
    const updates = next.map((r) =>
      supabase.from("routing_rules").update({ priority: r.priority }).eq("id", r.id),
    );
    const results = await Promise.all(updates);
    const firstErr = results.find((r) => r.error)?.error;
    if (firstErr) toast.error(firstErr.message);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("routing_rules").delete().eq("id", deleting.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRules((rs) => rs.filter((r) => r.id !== deleting.id));
    setDeleting(null);
    toast.success("Rule removed");
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <header className="flex items-end justify-between border-b border-border bg-surface-1 px-8 py-5">
        <div>
          <h1 className="text-xl font-medium tracking-tight text-text">Routing rules</h1>
          <p className="mt-0.5 text-xs text-text-muted">
            Auto-tag, archive or prioritise inbound mail before it reaches your inbox. Lower
            priority runs first.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Add rule
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-4xl">
      <div className="overflow-hidden rounded-md border border-border surface-1">
        <div className="grid grid-cols-[28px_minmax(0,1.6fr)_60px_minmax(0,1.6fr)_120px_72px] items-center gap-3 border-b border-border px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">
          <div></div>
          <div>Name</div>
          <div>Prio</div>
          <div>Actions</div>
          <div>Stats</div>
          <div className="text-right">Edit</div>
        </div>

        {loading ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">Loading…</div>
        ) : rules.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">No rules yet.</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={rules.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              {rules.map((rule) => (
                <SortableRuleRow
                  key={rule.id}
                  rule={rule}
                  onToggle={(v) => toggleActive(rule, v)}
                  onEdit={() => setEditing(rule)}
                  onTest={() => setTesting(rule)}
                  onDelete={() => setDeleting(rule)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <RoutingRuleFormDialog
        open={creating || !!editing}
        rule={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          load();
        }}
      />

      <RuleTestDialog rule={testing} onClose={() => setTesting(null)} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleting?.name}" will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </div>
      </div>
    </div>
  );
}

function SortableRuleRow({
  rule,
  onToggle,
  onEdit,
  onTest,
  onDelete,
}: {
  rule: RoutingRule;
  onToggle: (v: boolean) => void;
  onEdit: () => void;
  onTest: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rule.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const actionBadges: { label: string; key: string }[] = [];
  if (rule.action_add_category_id) actionBadges.push({ label: "+ category", key: "cat" });
  if (rule.action_add_label_id) actionBadges.push({ label: "+ label", key: "lbl" });
  if (rule.action_set_urgency)
    actionBadges.push({ label: `urgency: ${rule.action_set_urgency}`, key: "urg" });
  if (rule.action_mark_read) actionBadges.push({ label: "mark read", key: "rd" });
  if (rule.action_archive) actionBadges.push({ label: "archive", key: "ar" });

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[28px_minmax(0,1.6fr)_60px_minmax(0,1.6fr)_120px_72px] items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0 hover:surface-2"
    >
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Switch checked={rule.is_active} onCheckedChange={onToggle} />
          <span className="truncate font-medium">{rule.name}</span>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {[
            rule.match_from_contains && `from ~ ${rule.match_from_contains}`,
            rule.match_subject_contains && `subj ~ ${rule.match_subject_contains}`,
            rule.match_to_contains && `to ~ ${rule.match_to_contains}`,
            rule.match_has_header && `header: ${rule.match_has_header}`,
          ]
            .filter(Boolean)
            .join(" · ") || "no match conditions"}
        </div>
      </div>
      <div className="font-mono text-xs">{rule.priority}</div>
      <div className="flex flex-wrap gap-1">
        {actionBadges.length === 0 ? (
          <span className="text-xs text-muted-foreground">no actions</span>
        ) : (
          actionBadges.map((b) => (
            <Badge key={b.key} variant="secondary" className="text-[10px]">
              {b.label}
            </Badge>
          ))
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        {rule.times_matched ?? 0}× matched
        {rule.last_matched_at && (
          <div className="truncate">
            {new Date(rule.last_matched_at).toLocaleDateString()}
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-1">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onTest} title="Dry-run">
          <PlayCircle className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
