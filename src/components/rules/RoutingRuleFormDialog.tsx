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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export interface RoutingRule {
  id: string;
  name: string;
  priority: number;
  is_active: boolean;
  match_from_contains: string | null;
  match_subject_contains: string | null;
  match_to_contains: string | null;
  match_has_header: string | null;
  match_brand_id: string | null;
  action_add_category_id: string | null;
  action_add_label_id: string | null;
  action_set_urgency: string | null;
  action_mark_read: boolean;
  action_archive: boolean;
  times_matched: number | null;
  last_matched_at: string | null;
}

interface Props {
  open: boolean;
  rule: RoutingRule | null;
  onClose: () => void;
  onSaved: () => void;
}

const NONE = "__none__";

interface BrandOpt {
  id: string;
  name: string;
}
interface CategoryOpt {
  id: string;
  brand_id: string;
  name: string;
  emoji: string | null;
  brand_name: string;
}
interface LabelOpt {
  id: string;
  name: string;
  color: string;
}

const empty = {
  name: "",
  priority: 100,
  is_active: true,
  match_from_contains: "",
  match_subject_contains: "",
  match_to_contains: "",
  match_has_header: "",
  match_brand_id: "",
  action_add_category_id: "",
  action_add_label_id: "",
  action_set_urgency: "",
  action_mark_read: false,
  action_archive: false,
};

export default function RoutingRuleFormDialog({ open, rule, onClose, onSaved }: Props) {
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [brands, setBrands] = useState<BrandOpt[]>([]);
  const [categories, setCategories] = useState<CategoryOpt[]>([]);
  const [labels, setLabels] = useState<LabelOpt[]>([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [b, c, l] = await Promise.all([
        supabase.from("brands").select("id,name").order("sort_order"),
        supabase
          .from("brand_categories")
          .select("id,brand_id,name,emoji,brands(name)")
          .order("sort_order"),
        supabase.from("labels").select("id,name,color").order("name"),
      ]);
      setBrands((b.data ?? []) as BrandOpt[]);
      setCategories(
        ((c.data ?? []) as Array<{
          id: string;
          brand_id: string;
          name: string;
          emoji: string | null;
          brands: { name: string } | null;
        }>).map((row) => ({
          id: row.id,
          brand_id: row.brand_id,
          name: row.name,
          emoji: row.emoji,
          brand_name: row.brands?.name ?? "",
        })),
      );
      setLabels((l.data ?? []) as LabelOpt[]);
    })();
  }, [open]);

  useEffect(() => {
    if (rule) {
      setForm({
        name: rule.name,
        priority: rule.priority,
        is_active: rule.is_active,
        match_from_contains: rule.match_from_contains ?? "",
        match_subject_contains: rule.match_subject_contains ?? "",
        match_to_contains: rule.match_to_contains ?? "",
        match_has_header: rule.match_has_header ?? "",
        match_brand_id: rule.match_brand_id ?? "",
        action_add_category_id: rule.action_add_category_id ?? "",
        action_add_label_id: rule.action_add_label_id ?? "",
        action_set_urgency: rule.action_set_urgency ?? "",
        action_mark_read: rule.action_mark_read,
        action_archive: rule.action_archive,
      });
    } else {
      setForm(empty);
    }
  }, [rule, open]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: form.name,
        priority: form.priority,
        is_active: form.is_active,
        match_from_contains: form.match_from_contains || null,
        match_subject_contains: form.match_subject_contains || null,
        match_to_contains: form.match_to_contains || null,
        match_has_header: form.match_has_header || null,
        match_brand_id: form.match_brand_id || null,
        action_add_category_id: form.action_add_category_id || null,
        action_add_label_id: form.action_add_label_id || null,
        action_set_urgency: form.action_set_urgency || null,
        action_mark_read: form.action_mark_read,
        action_archive: form.action_archive,
      };
      if (rule) {
        const { error } = await supabase.from("routing_rules").update(payload).eq("id", rule.id);
        if (error) throw error;
        toast.success("Rule updated");
      } else {
        const { error } = await supabase.from("routing_rules").insert(payload);
        if (error) throw error;
        toast.success("Rule added");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const filteredCategories = form.match_brand_id
    ? categories.filter((c) => c.brand_id === form.match_brand_id)
    : categories;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="surface-1 max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit rule" : "Add routing rule"}</DialogTitle>
          <DialogDescription>
            All match conditions must be true for the rule to fire. Lower priority = runs first.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="name">Rule name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Stripe notificaties"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Input
              id="priority"
              type="number"
              value={form.priority}
              onChange={(e) => set("priority", parseInt(e.target.value || "100", 10))}
            />
          </div>
          <div className="flex items-end">
            <div className="flex w-full items-center justify-between rounded-md border border-border surface-2 px-3 py-2">
              <Label htmlFor="is_active" className="cursor-pointer">
                Active
              </Label>
              <Switch
                id="is_active"
                checked={form.is_active}
                onCheckedChange={(v) => set("is_active", v)}
              />
            </div>
          </div>
        </div>

        <Separator className="my-2" />
        <h3 className="text-sm font-semibold">Match conditions (all must be true)</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="match_from_contains">From contains</Label>
            <Input
              id="match_from_contains"
              value={form.match_from_contains}
              onChange={(e) => set("match_from_contains", e.target.value)}
              placeholder="@stripe.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="match_subject_contains">Subject contains</Label>
            <Input
              id="match_subject_contains"
              value={form.match_subject_contains}
              onChange={(e) => set("match_subject_contains", e.target.value)}
              placeholder="payout"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="match_to_contains">To contains</Label>
            <Input
              id="match_to_contains"
              value={form.match_to_contains}
              onChange={(e) => set("match_to_contains", e.target.value)}
              placeholder="@vanxcel.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="match_has_header">Has header</Label>
            <Input
              id="match_has_header"
              value={form.match_has_header}
              onChange={(e) => set("match_has_header", e.target.value)}
              placeholder="List-Unsubscribe"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Brand</Label>
            <Select
              value={form.match_brand_id || NONE}
              onValueChange={(v) => set("match_brand_id", v === NONE ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Any brand" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Any brand</SelectItem>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator className="my-2" />
        <h3 className="text-sm font-semibold">Actions</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Add category</Label>
            <Select
              value={form.action_add_category_id || NONE}
              onValueChange={(v) => set("action_add_category_id", v === NONE ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {filteredCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.emoji} {c.name}
                    {!form.match_brand_id && (
                      <span className="text-muted-foreground"> · {c.brand_name}</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Add label</Label>
            <Select
              value={form.action_add_label_id || NONE}
              onValueChange={(v) => set("action_add_label_id", v === NONE ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {labels.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Set urgency</Label>
            <Select
              value={form.action_set_urgency || NONE}
              onValueChange={(v) => set("action_set_urgency", v === NONE ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Don't change" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Don't change</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Flags</Label>
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-md border border-border surface-2 px-3 py-1.5">
                <Label htmlFor="action_mark_read" className="cursor-pointer text-sm">
                  Mark as read
                </Label>
                <Switch
                  id="action_mark_read"
                  checked={form.action_mark_read}
                  onCheckedChange={(v) => set("action_mark_read", v)}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border border-border surface-2 px-3 py-1.5">
                <Label htmlFor="action_archive" className="cursor-pointer text-sm">
                  Auto-archive
                </Label>
                <Switch
                  id="action_archive"
                  checked={form.action_archive}
                  onCheckedChange={(v) => set("action_archive", v)}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : rule ? "Save changes" : "Add rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
