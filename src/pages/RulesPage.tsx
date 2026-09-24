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
import { MoreHorizontal, GripVertical, Pencil, Plus, PlayCircle, Trash2 } from "lucide-react";
import AppShell from "@/components/AppShell";
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
import { useI18n, useT } from "@/i18n";
import { fmtDate } from "@/i18n/format";
import { TableSkeleton } from "@/components/settings/TableSkeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function RulesPage() {
  const t = useT();
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
    toast.success(t("rules.toast.removed"));
  };

  return (
    <AppShell>
      <div className="mb-section flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("rules.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("rules.subtitle")}</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> {t("rules.add")}
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border border-border surface-1">
        <div className="hidden items-center gap-3 md:grid md:grid-cols-[28px_minmax(0,1.6fr)_60px_minmax(0,1.6fr)_120px_72px] border-b border-border px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">
          <div></div>
          <div>{t("rules.col.name")}</div>
          <div>{t("rules.col.priority")}</div>
          <div>{t("rules.col.actions")}</div>
          <div>{t("rules.col.stats")}</div>
          <div className="text-right">{t("rules.col.edit")}</div>
        </div>

        {loading ? (
          <TableSkeleton />
        ) : rules.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">{t("rules.empty")}</div>
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
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("rules.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("rules.delete.body", { name: deleting?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
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
  const t = useT();
  const { locale } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rule.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const actionBadges: { label: string; key: string }[] = [];
  if (rule.action_add_category_id) actionBadges.push({ label: t("rules.badge.category"), key: "cat" });
  if (rule.action_add_label_id) actionBadges.push({ label: t("rules.badge.label"), key: "lbl" });
  if (rule.action_set_urgency)
    actionBadges.push({
      label: t("rules.badge.urgency", { value: rule.action_set_urgency }),
      key: "urg",
    });
  if (rule.action_mark_read) actionBadges.push({ label: t("rules.badge.markRead"), key: "rd" });
  if (rule.action_archive) actionBadges.push({ label: t("rules.badge.archive"), key: "ar" });

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 [&>*]:min-w-0 md:grid md:grid-cols-[28px_minmax(0,1.6fr)_60px_minmax(0,1.6fr)_120px_72px] md:gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0 hover:surface-2"
    >
      <button
        {...attributes}
        {...listeners}
        aria-label={t("settings.brands.reorder")}
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
            rule.match_from_contains &&
              t("rules.match.from", { value: rule.match_from_contains }),
            rule.match_subject_contains &&
              t("rules.match.subject", { value: rule.match_subject_contains }),
            rule.match_to_contains && t("rules.match.to", { value: rule.match_to_contains }),
            rule.match_has_header && t("rules.match.header", { value: rule.match_has_header }),
          ]
            .filter(Boolean)
            .join(" · ") || t("rules.match.none")}
        </div>
      </div>
      <div className="font-mono text-xs">{rule.priority}</div>
      <div className="flex flex-wrap gap-1">
        {actionBadges.length === 0 ? (
          <span className="text-xs text-muted-foreground">{t("rules.badge.none")}</span>
        ) : (
          actionBadges.map((b) => (
            <Badge key={b.key} variant="secondary" className="text-2xs">
              {b.label}
            </Badge>
          ))
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        {t("rules.stats.matched", { count: rule.times_matched ?? 0 })}
        {rule.last_matched_at && (
          <div className="truncate">
            {t("rules.stats.last", { date: fmtDate(rule.last_matched_at, locale) })}
          </div>
        )}
      </div>
      <div className="flex items-center justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-touch" variant="ghost" aria-label={t("rules.col.edit")}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onTest}>
              <PlayCircle className="mr-2 h-4 w-4" /> {t("rules.action.test")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" /> {t("common.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" /> {t("common.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
