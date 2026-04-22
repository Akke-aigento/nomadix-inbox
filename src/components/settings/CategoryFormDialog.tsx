import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export interface BrandCategory {
  id: string;
  brand_id: string;
  slug: string;
  name: string;
  emoji: string | null;
  color: string;
  description: string | null;
  sort_order: number;
  is_ai_enabled: boolean;
}

interface Props {
  open: boolean;
  brandId: string;
  category: BrandCategory | null;
  existingSortOrders: number[];
  onClose: () => void;
  onSaved: () => void;
}

const COMMON_EMOJI = ["📦", "🚚", "💳", "↩️", "❓", "🔧", "🤝", "🔴", "✨", "🚀", "🎯", "💫", "💡", "👤", "🛒", "📧", "📞", "🔔"];

const empty = {
  slug: "",
  name: "",
  emoji: "",
  color: "#64748B",
  description: "",
  is_ai_enabled: true,
};

export default function CategoryFormDialog({
  open,
  brandId,
  category,
  existingSortOrders,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (category) {
      setForm({
        slug: category.slug,
        name: category.name,
        emoji: category.emoji ?? "",
        color: category.color,
        description: category.description ?? "",
        is_ai_enabled: category.is_ai_enabled,
      });
    } else {
      setForm(empty);
    }
  }, [category, open]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    if (!form.slug || !form.name) {
      toast.error("Slug and name are required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        slug: form.slug,
        name: form.name,
        emoji: form.emoji || null,
        color: form.color,
        description: form.description || null,
        is_ai_enabled: form.is_ai_enabled,
      };
      if (category) {
        const { error } = await supabase
          .from("brand_categories")
          .update(payload)
          .eq("id", category.id);
        if (error) throw error;
        toast.success("Category updated");
      } else {
        const max = existingSortOrders.length ? Math.max(...existingSortOrders) : 0;
        const { error } = await supabase
          .from("brand_categories")
          .insert({ ...payload, brand_id: brandId, sort_order: max + 10 });
        if (error) throw error;
        toast.success("Category added");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="surface-1 max-w-xl">
        <DialogHeader>
          <DialogTitle>{category ? "Edit category" : "Add category"}</DialogTitle>
          <DialogDescription>
            Categories help the AI tag inbound mail consistently per brand.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={form.slug}
              onChange={(e) =>
                set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
              }
              placeholder="order"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Order"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emoji">Emoji</Label>
            <div className="flex items-center gap-2">
              <Input
                id="emoji"
                value={form.emoji}
                onChange={(e) => set("emoji", e.target.value.slice(0, 2))}
                placeholder="📦"
                className="w-20 text-center text-lg"
                maxLength={4}
              />
              <div className="flex flex-wrap gap-1">
                {COMMON_EMOJI.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => set("emoji", em)}
                    className="rounded p-1 text-base hover:surface-2"
                    aria-label={`Use ${em}`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="color">Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                id="color"
                value={form.color}
                onChange={(e) => set("color", e.target.value)}
                className="h-10 w-12 cursor-pointer rounded-md border border-border bg-transparent"
              />
              <Input
                value={form.color}
                onChange={(e) => set("color", e.target.value)}
                className="font-mono"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description (helps AI matching)</Label>
          <Textarea
            id="description"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            placeholder="Alles rond nieuwe bestellingen, order status vragen"
          />
        </div>

        <div className="flex items-center justify-between rounded-md border border-border surface-2 px-3 py-2">
          <div>
            <Label htmlFor="is_ai_enabled" className="cursor-pointer">
              AI may pick this category
            </Label>
            <p className="text-xs text-muted-foreground">
              Disable to keep the category but exclude it from AI auto-tagging.
            </p>
          </div>
          <Switch
            id="is_ai_enabled"
            checked={form.is_ai_enabled}
            onCheckedChange={(v) => set("is_ai_enabled", v)}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : category ? "Save changes" : "Add category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
