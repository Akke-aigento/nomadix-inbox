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
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { sanitizeSignature } from "@/lib/sanitize";

export interface BrandAccount {
  id: string;
  brand_id: string;
  display_name: string;
  email_alias: string | null;
  role_title: string | null;
  avatar_url: string | null;
  signature_html: string;
  is_default: boolean;
  sort_order: number;
}

interface Props {
  open: boolean;
  brandId: string;
  account: BrandAccount | null;
  defaultDisplayName?: string;
  onClose: () => void;
  onSaved: () => void;
}

const empty = {
  display_name: "",
  email_alias: "",
  role_title: "",
  avatar_url: "",
  signature_html: "",
  is_default: false,
};

export default function BrandAccountFormDialog({
  open,
  brandId,
  account,
  defaultDisplayName,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (account) {
      setForm({
        display_name: account.display_name,
        email_alias: account.email_alias ?? "",
        role_title: account.role_title ?? "",
        avatar_url: account.avatar_url ?? "",
        signature_html: account.signature_html ?? "",
        is_default: account.is_default,
      });
    } else {
      setForm({ ...empty, display_name: defaultDisplayName ?? "" });
    }
  }, [account, open, defaultDisplayName]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleAvatar = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${brandId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("brand-account-avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("brand-account-avatars").getPublicUrl(path);
      set("avatar_url", data.publicUrl);
      toast.success("Avatar uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const submit = async () => {
    if (!form.display_name.trim()) {
      toast.error("Display name is required");
      return;
    }
    if (!form.signature_html.trim()) {
      toast.error("Signature is required");
      return;
    }
    setBusy(true);
    try {
      // If becoming default, clear other defaults first to honor unique partial index.
      if (form.is_default) {
        const { error: clearErr } = await supabase
          .from("brand_accounts")
          .update({ is_default: false })
          .eq("brand_id", brandId)
          .neq("id", account?.id ?? "00000000-0000-0000-0000-000000000000");
        if (clearErr) throw clearErr;
      }

      const payload = {
        brand_id: brandId,
        display_name: form.display_name,
        email_alias: form.email_alias || null,
        role_title: form.role_title || null,
        avatar_url: form.avatar_url || null,
        signature_html: form.signature_html,
        is_default: form.is_default,
      };

      if (account) {
        const { error } = await supabase
          .from("brand_accounts")
          .update(payload)
          .eq("id", account.id);
        if (error) throw error;
        toast.success("Account updated");
      } else {
        const { error } = await supabase.from("brand_accounts").insert(payload);
        if (error) throw error;
        toast.success("Account added");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const initials = form.display_name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="surface-1 max-w-2xl">
        <DialogHeader>
          <DialogTitle>{account ? "Edit account" : "Add account"}</DialogTitle>
          <DialogDescription>
            A person who sends mail under this brand with their own signature.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="display_name">Display name</Label>
            <Input
              id="display_name"
              value={form.display_name}
              onChange={(e) => set("display_name", e.target.value)}
              placeholder="Akke Mercken"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role_title">Role / title</Label>
            <Input
              id="role_title"
              value={form.role_title}
              onChange={(e) => set("role_title", e.target.value)}
              placeholder="Founder"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email_alias">Email alias (optional)</Label>
            <Input
              id="email_alias"
              type="email"
              value={form.email_alias}
              onChange={(e) => set("email_alias", e.target.value)}
              placeholder="Leeg = gebruikt brand email_address"
            />
          </div>
          <div className="space-y-2">
            <Label>Avatar</Label>
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                {form.avatar_url ? <AvatarImage src={form.avatar_url} alt={form.display_name} /> : null}
                <AvatarFallback className="text-xs">{initials || "?"}</AvatarFallback>
              </Avatar>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border surface-2 px-3 py-1.5 text-sm hover:surface-3">
                <Upload className="h-4 w-4" />
                {uploading ? "Uploading…" : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatar}
                  disabled={uploading}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="signature_html">Signature (HTML)</Label>
          <div className="grid gap-3 lg:grid-cols-2">
            <Textarea
              id="signature_html"
              value={form.signature_html}
              onChange={(e) => set("signature_html", e.target.value)}
              rows={10}
              className="font-mono text-xs"
              placeholder="<p>Akke<br/>Founder, Loveke<br/>akke@loveke.be</p>"
            />
            <div className="rounded-md border border-border surface-2 p-3">
              <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                Preview
              </div>
              {form.signature_html ? (
                <div
                  className="prose prose-sm prose-invert max-w-none text-sm"
                  dangerouslySetInnerHTML={{ __html: sanitizeSignature(form.signature_html) }}
                />
              ) : (
                <div className="text-sm text-muted-foreground">No signature yet.</div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border surface-2 px-3 py-2">
          <div>
            <Label htmlFor="is_default" className="cursor-pointer">
              Default account for this brand
            </Label>
            <p className="text-xs text-muted-foreground">
              Selected automatically when composing under this brand.
            </p>
          </div>
          <Switch
            id="is_default"
            checked={form.is_default}
            onCheckedChange={(v) => set("is_default", v)}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : account ? "Save changes" : "Add account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
