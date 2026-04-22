import { useEffect, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
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

export interface Brand {
  id: string;
  slug: string;
  name: string;
  email_address: string;
  display_name: string;
  color_primary: string;
  logo_url: string | null;
  signature_html: string | null;
  sort_order: number;
  is_active: boolean;
}

interface Props {
  open: boolean;
  brand: Brand | null;
  existingSortOrders: number[];
  onClose: () => void;
  onSaved: () => void;
}

const empty = {
  slug: "",
  name: "",
  email_address: "",
  display_name: "",
  color_primary: "#6366F1",
  logo_url: "",
  signature_html: "",
};

export default function BrandFormDialog({
  open,
  brand,
  existingSortOrders,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (brand) {
      setForm({
        slug: brand.slug,
        name: brand.name,
        email_address: brand.email_address,
        display_name: brand.display_name,
        color_primary: brand.color_primary,
        logo_url: brand.logo_url ?? "",
        signature_html: brand.signature_html ?? "",
      });
    } else {
      setForm(empty);
    }
  }, [brand, open]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${form.slug || crypto.randomUUID()}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("brand-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("brand-logos").getPublicUrl(path);
      set("logo_url", data.publicUrl);
      toast.success("Logo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const submit = async () => {
    if (!form.slug || !form.name || !form.email_address || !form.display_name) {
      toast.error("Slug, name, email and display name are required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        slug: form.slug,
        name: form.name,
        email_address: form.email_address,
        display_name: form.display_name,
        color_primary: form.color_primary,
        logo_url: form.logo_url || null,
        signature_html: form.signature_html || null,
      };
      if (brand) {
        const { error } = await supabase.from("brands").update(payload).eq("id", brand.id);
        if (error) throw error;
        toast.success("Brand updated");
      } else {
        const maxOrder = existingSortOrders.length ? Math.max(...existingSortOrders) : 0;
        const { error } = await supabase
          .from("brands")
          .insert({ ...payload, sort_order: maxOrder + 10, is_active: true });
        if (error) throw error;
        toast.success("Brand added");
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
      <DialogContent className="surface-1 max-w-2xl">
        <DialogHeader>
          <DialogTitle>{brand ? "Edit brand" : "Add brand"}</DialogTitle>
          <DialogDescription>
            Configure the email identity used when replying from this brand.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={form.slug}
              onChange={(e) => set("slug", e.target.value.toLowerCase().trim())}
              placeholder="sellqo"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="SellQo"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email_address">Email address</Label>
            <Input
              id="email_address"
              type="email"
              value={form.email_address}
              onChange={(e) => set("email_address", e.target.value)}
              placeholder="info@sellqo.app"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="display_name">Display name (From:)</Label>
            <Input
              id="display_name"
              value={form.display_name}
              onChange={(e) => set("display_name", e.target.value)}
              placeholder="SellQo Support"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="color_primary">Brand color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                id="color_primary"
                value={form.color_primary}
                onChange={(e) => set("color_primary", e.target.value)}
                className="h-10 w-12 cursor-pointer rounded-md border border-border bg-transparent"
              />
              <Input
                value={form.color_primary}
                onChange={(e) => set("color_primary", e.target.value)}
                className="font-mono"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              {form.logo_url ? (
                <img
                  src={form.logo_url}
                  alt="Brand logo preview"
                  className="h-10 w-10 rounded-md border border-border object-contain surface-2"
                />
              ) : (
                <div className="h-10 w-10 rounded-md border border-dashed border-border surface-2" />
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border surface-2 px-3 py-1.5 text-sm hover:surface-3">
                <Upload className="h-4 w-4" />
                {uploading ? "Uploading…" : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogo}
                  disabled={uploading}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="signature_html">Signature (HTML)</Label>
          <Textarea
            id="signature_html"
            value={form.signature_html}
            onChange={(e) => set("signature_html", e.target.value)}
            rows={6}
            className="font-mono text-xs"
            placeholder="<p>Best,<br/>Akke — SellQo</p>"
          />
          {form.signature_html && (
            <div className="rounded-md border border-border surface-2 p-3">
              <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                Preview
              </div>
              <div
                className="prose prose-sm prose-invert max-w-none text-sm"
                dangerouslySetInnerHTML={{ __html: form.signature_html }}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : brand ? "Save changes" : "Add brand"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
