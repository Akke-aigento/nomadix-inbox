import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
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
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
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
import BrandFormDialog, { type Brand } from "./BrandFormDialog";

export default function BrandsTab() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Brand | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("brands")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) toast.error(error.message);
    setBrands((data ?? []) as unknown as Brand[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleActive = async (brand: Brand, value: boolean) => {
    const { error } = await supabase
      .from("brands")
      .update({ is_active: value })
      .eq("id", brand.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setBrands((bs) => bs.map((b) => (b.id === brand.id ? { ...b, is_active: value } : b)));
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = brands.findIndex((b) => b.id === active.id);
    const newIndex = brands.findIndex((b) => b.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(brands, oldIndex, newIndex).map((b, i) => ({
      ...b,
      sort_order: (i + 1) * 10,
    }));
    setBrands(next);
    // Persist all changed sort orders
    const updates = next.map((b) =>
      supabase.from("brands").update({ sort_order: b.sort_order }).eq("id", b.id),
    );
    const results = await Promise.all(updates);
    const firstErr = results.find((r) => r.error)?.error;
    if (firstErr) toast.error(firstErr.message);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("brands").delete().eq("id", deleting.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setBrands((bs) => bs.filter((b) => b.id !== deleting.id));
    setDeleting(null);
    toast.success("Brand deleted");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Brands</h2>
          <p className="text-xs text-muted-foreground">
            Drag to reorder. Each brand maps to an email address and signature.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Add brand
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border border-border surface-1">
        <div className="grid grid-cols-[32px_28px_minmax(0,1.4fr)_minmax(0,1.4fr)_120px_72px] items-center gap-3 border-b border-border px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">
          <div></div>
          <div></div>
          <div>Name</div>
          <div>Email</div>
          <div>Active</div>
          <div className="text-right">Actions</div>
        </div>

        {loading ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">Loading…</div>
        ) : brands.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">No brands yet.</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={brands.map((b) => b.id)}
              strategy={verticalListSortingStrategy}
            >
              {brands.map((brand) => (
                <SortableRow
                  key={brand.id}
                  brand={brand}
                  onToggle={(v) => toggleActive(brand, v)}
                  onEdit={() => setEditing(brand)}
                  onDelete={() => setDeleting(brand)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <BrandFormDialog
        open={creating || !!editing}
        brand={editing}
        existingSortOrders={brands.map((b) => b.sort_order)}
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
            <AlertDialogTitle>Delete this brand?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.name} will be removed. Threads previously linked to it will keep their
              messages but lose the brand association. This cannot be undone.
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
  );
}

function SortableRow({
  brand,
  onToggle,
  onEdit,
  onDelete,
}: {
  brand: Brand;
  onToggle: (v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: brand.id,
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
      className="grid grid-cols-[32px_28px_minmax(0,1.4fr)_minmax(0,1.4fr)_120px_72px] items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0 hover:surface-2"
    >
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div
        className="h-4 w-4 rounded-sm border border-border"
        style={{ backgroundColor: brand.color_primary }}
        title={brand.color_primary}
      />
      <div className="min-w-0">
        <div className="truncate font-medium">{brand.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {brand.display_name} · {brand.slug}
        </div>
      </div>
      <div className="truncate text-muted-foreground">{brand.email_address}</div>
      <div>
        <Switch checked={brand.is_active} onCheckedChange={onToggle} />
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
