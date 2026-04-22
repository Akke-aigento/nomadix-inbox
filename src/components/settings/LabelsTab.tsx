import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Label {
  id: string;
  name: string;
  color: string;
}

export default function LabelsTab() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState({ name: "", color: "#64748B" });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", color: "" });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("labels")
      .select("*")
      .order("name", { ascending: true });
    if (error) toast.error(error.message);
    setLabels((data ?? []) as Label[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    if (!newLabel.name.trim()) return;
    const { error } = await supabase.from("labels").insert(newLabel);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewLabel({ name: "", color: "#64748B" });
    setAdding(false);
    load();
  };

  const startEdit = (label: Label) => {
    setEditId(label.id);
    setEditForm({ name: label.name, color: label.color });
  };

  const saveEdit = async () => {
    if (!editId || !editForm.name.trim()) return;
    const { error } = await supabase.from("labels").update(editForm).eq("id", editId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEditId(null);
    load();
  };

  const remove = async (label: Label) => {
    const { error } = await supabase.from("labels").delete().eq("id", label.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Labels</h2>
          <p className="text-xs text-muted-foreground">
            Tags you can apply to threads later.
          </p>
        </div>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add label
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-md border border-border surface-1">
        {adding && (
          <div className="flex items-center gap-2 border-b border-border surface-2 px-3 py-2">
            <input
              type="color"
              value={newLabel.color}
              onChange={(e) => setNewLabel((l) => ({ ...l, color: e.target.value }))}
              className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
            />
            <Input
              autoFocus
              value={newLabel.name}
              placeholder="Label name"
              onChange={(e) => setNewLabel((l) => ({ ...l, name: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && add()}
              className="h-8 flex-1"
            />
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              <X className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={add}>
              <Check className="h-4 w-4" />
            </Button>
          </div>
        )}

        {loading ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">Loading…</div>
        ) : labels.length === 0 && !adding ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">No labels yet.</div>
        ) : (
          labels.map((label) => (
            <div
              key={label.id}
              className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0 hover:surface-2"
            >
              {editId === label.id ? (
                <>
                  <input
                    type="color"
                    value={editForm.color}
                    onChange={(e) => setEditForm((f) => ({ ...f, color: e.target.value }))}
                    className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
                  />
                  <Input
                    autoFocus
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                    className="h-8 flex-1"
                  />
                  <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                  <Button size="sm" onClick={saveEdit}>
                    <Check className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: `${label.color}33`,
                      color: label.color,
                      border: `1px solid ${label.color}66`,
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: label.color }}
                    />
                    {label.name}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => startEdit(label)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(label)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
