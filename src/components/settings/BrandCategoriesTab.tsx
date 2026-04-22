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
import { GripVertical, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import CategoryFormDialog, { type BrandCategory } from "./CategoryFormDialog";

interface Props {
  brandId: string;
}

const UNIVERSAL_DEFAULTS: Array<Omit<BrandCategory, "id" | "brand_id">> = [
  { slug: "order", name: "Order", emoji: "📦", color: "#3B82F6", description: "Nieuwe bestellingen, orderstatus", sort_order: 10, is_ai_enabled: true },
  { slug: "levering", name: "Levering", emoji: "🚚", color: "#06B6D4", description: "Verzending, tracking, levering issues", sort_order: 20, is_ai_enabled: true },
  { slug: "betaling", name: "Betaling", emoji: "💳", color: "#10B981", description: "Facturen, betalingen, refunds", sort_order: 30, is_ai_enabled: true },
  { slug: "retour", name: "Retour", emoji: "↩️", color: "#F59E0B", description: "Return requests, klachten over product", sort_order: 40, is_ai_enabled: true },
  { slug: "vraag", name: "Vraag", emoji: "❓", color: "#8B5CF6", description: "Algemene vragen, productinfo", sort_order: 50, is_ai_enabled: true },
  { slug: "technisch", name: "Technisch", emoji: "🔧", color: "#EF4444", description: "Bug reports, technische support", sort_order: 60, is_ai_enabled: true },
  { slug: "partner", name: "Partner", emoji: "🤝", color: "#14B8A6", description: "Leveranciers, partners, B2B", sort_order: 70, is_ai_enabled: true },
  { slug: "spam", name: "Spam", emoji: "🔴", color: "#64748B", description: "Ongewenste mail", sort_order: 80, is_ai_enabled: true },
];

export default function BrandCategoriesTab({ brandId }: Props) {
  const [items, setItems] = useState<BrandCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BrandCategory | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<BrandCategory | null>(null);
  const [resetting, setResetting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("brand_categories")
      .select("*")
      .eq("brand_id", brandId)
      .order("sort_order", { ascending: true });
    if (error) toast.error(error.message);
    setItems((data ?? []) as BrandCategory[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [brandId]);

  const toggleAI = async (cat: BrandCategory, value: boolean) => {
    const { error } = await supabase
      .from("brand_categories")
      .update({ is_ai_enabled: value })
      .eq("id", cat.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setItems((cs) => cs.map((c) => (c.id === cat.id ? { ...c, is_ai_enabled: value } : c)));
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((c) => c.id === active.id);
    const newIndex = items.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex).map((c, i) => ({
      ...c,
      sort_order: (i + 1) * 10,
    }));
    setItems(next);
    const updates = next.map((c) =>
      supabase.from("brand_categories").update({ sort_order: c.sort_order }).eq("id", c.id),
    );
    const results = await Promise.all(updates);
    const firstErr = results.find((r) => r.error)?.error;
    if (firstErr) toast.error(firstErr.message);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("brand_categories").delete().eq("id", deleting.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setItems((cs) => cs.filter((c) => c.id !== deleting.id));
    setDeleting(null);
    toast.success("Category removed");
  };

  const handleReset = async () => {
    setResetting(false);
    const { error: delErr } = await supabase
      .from("brand_categories")
      .delete()
      .eq("brand_id", brandId);
    if (delErr) {
      toast.error(delErr.message);
      return;
    }
    const rows = UNIVERSAL_DEFAULTS.map((d) => ({ ...d, brand_id: brandId }));
    const { error: insErr } = await supabase.from("brand_categories").insert(rows);
    if (insErr) {
      toast.error(insErr.message);
      return;
    }
    toast.success("Categories reset to universal defaults");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Categories the AI can pick when classifying inbound mail. Drag to reorder.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setResetting(true)}>
            <RotateCcw className="h-4 w-4" /> Reset to defaults
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Add category
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-border surface-1">
        <div className="grid grid-cols-[28px_36px_minmax(0,1.2fr)_minmax(0,1.6fr)_28px_88px_72px] items-center gap-3 border-b border-border px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">
          <div></div>
          <div></div>
          <div>Name</div>
          <div>Description</div>
          <div></div>
          <div>AI</div>
          <div className="text-right">Actions</div>
        </div>

        {loading ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">No categories yet.</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {items.map((cat) => (
                <SortableCategoryRow
                  key={cat.id}
                  category={cat}
                  onToggleAI={(v) => toggleAI(cat, v)}
                  onEdit={() => setEditing(cat)}
                  onDelete={() => setDeleting(cat)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <CategoryFormDialog
        open={creating || !!editing}
        brandId={brandId}
        category={editing}
        existingSortOrders={items.map((i) => i.sort_order)}
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

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this category?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.emoji} {deleting?.name} — existing message-tags will also be removed.
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

      <AlertDialog open={resetting} onOpenChange={setResetting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset categories to defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              All current categories for this brand will be deleted and replaced with the universal
              set (8 categories). Tagged messages lose their categorisation. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReset}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SortableCategoryRow({
  category,
  onToggleAI,
  onEdit,
  onDelete,
}: {
  category: BrandCategory;
  onToggleAI: (v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[28px_36px_minmax(0,1.2fr)_minmax(0,1.6fr)_28px_88px_72px] items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0 hover:surface-2"
    >
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="text-xl leading-none">{category.emoji ?? "·"}</div>
      <div className="min-w-0 truncate font-medium">{category.name}</div>
      <div className="min-w-0 truncate text-xs text-muted-foreground">
        {category.description ?? ""}
      </div>
      <div
        className="h-3 w-3 rounded-sm border border-border"
        style={{ backgroundColor: category.color }}
        title={category.color}
      />
      <div>
        <Switch checked={category.is_ai_enabled} onCheckedChange={onToggleAI} />
      </div>
      <div className="flex items-center justify-end gap-1">
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
