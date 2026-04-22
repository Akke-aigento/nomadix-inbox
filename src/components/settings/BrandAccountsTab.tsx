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
import { GripVertical, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import BrandAccountFormDialog, { type BrandAccount } from "./BrandAccountFormDialog";

interface Props {
  brandId: string;
  brandFallbackName: string;
}

export default function BrandAccountsTab({ brandId, brandFallbackName }: Props) {
  const [accounts, setAccounts] = useState<BrandAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BrandAccount | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<BrandAccount | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("brand_accounts")
      .select("*")
      .eq("brand_id", brandId)
      .order("sort_order", { ascending: true })
      .order("display_name", { ascending: true });
    if (error) toast.error(error.message);
    setAccounts((data ?? []) as BrandAccount[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [brandId]);

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = accounts.findIndex((a) => a.id === active.id);
    const newIndex = accounts.findIndex((a) => a.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(accounts, oldIndex, newIndex).map((a, i) => ({
      ...a,
      sort_order: (i + 1) * 10,
    }));
    setAccounts(next);
    const updates = next.map((a) =>
      supabase.from("brand_accounts").update({ sort_order: a.sort_order }).eq("id", a.id),
    );
    const results = await Promise.all(updates);
    const firstErr = results.find((r) => r.error)?.error;
    if (firstErr) toast.error(firstErr.message);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("brand_accounts").delete().eq("id", deleting.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setAccounts((acc) => acc.filter((a) => a.id !== deleting.id));
    setDeleting(null);
    toast.success("Account removed");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          People who can send mail under this brand. Each has their own signature.
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Add account
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border border-border surface-1">
        {loading ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">Loading…</div>
        ) : accounts.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">No accounts yet.</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={accounts.map((a) => a.id)}
              strategy={verticalListSortingStrategy}
            >
              {accounts.map((acc) => (
                <SortableAccountRow
                  key={acc.id}
                  account={acc}
                  onEdit={() => setEditing(acc)}
                  onDelete={() => setDeleting(acc)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <BrandAccountFormDialog
        open={creating || !!editing}
        brandId={brandId}
        account={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          load();
        }}
        defaultDisplayName={brandFallbackName}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this account?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.display_name} will be removed. Existing messages keep their data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SortableAccountRow({
  account,
  onEdit,
  onDelete,
}: {
  account: BrandAccount;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: account.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const initials = account.display_name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[28px_40px_minmax(0,1fr)_auto_72px] items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0 hover:surface-2"
    >
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Avatar className="h-8 w-8">
        {account.avatar_url ? <AvatarImage src={account.avatar_url} alt={account.display_name} /> : null}
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{account.display_name}</span>
          {account.is_default && (
            <Badge variant="secondary" className="gap-1">
              <Star className="h-3 w-3" /> default
            </Badge>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {[account.role_title, account.email_alias].filter(Boolean).join(" · ") || "—"}
        </div>
      </div>
      <div />
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
