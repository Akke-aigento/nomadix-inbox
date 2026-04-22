import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Star, Trash2, Plus, Globe, Mail, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

interface Address {
  id: string;
  brand_id: string;
  email_address: string;
  is_primary: boolean;
  is_catch_all: boolean;
  catch_all_domain: string | null;
  is_reply_default: boolean;
  label: string | null;
  sort_order: number;
}

interface Props {
  brandId: string;
}

const FOLLOW_INCOMING = "__follow_incoming__";

export default function BrandEmailAddressesManager({ brandId }: Props) {
  const [rows, setRows] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState<"address" | "catchall" | null>(null);
  const [editing, setEditing] = useState<Address | null>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);
  const [busy, setBusy] = useState(false);

  // Add-form state
  const [formEmail, setFormEmail] = useState("");
  const [formDomain, setFormDomain] = useState("");
  const [formLabel, setFormLabel] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("brand_email_addresses")
      .select("*")
      .eq("brand_id", brandId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      toast.error(error.message);
    } else {
      setRows(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (brandId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  const openAdd = (mode: "address" | "catchall") => {
    setFormEmail("");
    setFormDomain("");
    setFormLabel(mode === "catchall" ? "Catch-all" : "");
    setEditing(null);
    setAddOpen(mode);
  };

  const openEdit = (row: Address) => {
    setEditing(row);
    setFormEmail(row.email_address);
    setFormDomain(row.catch_all_domain ?? "");
    setFormLabel(row.label ?? "");
    setAddOpen(row.is_catch_all ? "catchall" : "address");
  };

  const closeForm = () => {
    setAddOpen(null);
    setEditing(null);
  };

  const submitForm = async () => {
    setBusy(true);
    try {
      if (addOpen === "address") {
        const email = formEmail.trim().toLowerCase();
        if (!email || !email.includes("@")) {
          toast.error("Enter a valid email address");
          return;
        }
        if (editing) {
          const { error } = await supabase
            .from("brand_email_addresses")
            .update({ email_address: email, label: formLabel || null })
            .eq("id", editing.id);
          if (error) throw error;
          toast.success("Address updated");
        } else {
          const isFirst = rows.length === 0;
          const maxOrder = rows.length
            ? Math.max(...rows.map((r) => r.sort_order))
            : 0;
          const { error } = await supabase
            .from("brand_email_addresses")
            .insert({
              brand_id: brandId,
              email_address: email,
              label: formLabel || null,
              is_primary: isFirst,
              sort_order: maxOrder + 1,
            });
          if (error) throw error;
          toast.success("Address added");
        }
      } else if (addOpen === "catchall") {
        const domain = formDomain.trim().toLowerCase().replace(/^@/, "");
        if (!domain || !domain.includes(".")) {
          toast.error("Enter a valid domain (e.g. vanxcel.com)");
          return;
        }
        const display = `*@${domain}`;
        if (editing) {
          const { error } = await supabase
            .from("brand_email_addresses")
            .update({
              email_address: display,
              catch_all_domain: domain,
              label: formLabel || "Catch-all",
            })
            .eq("id", editing.id);
          if (error) throw error;
          toast.success("Catch-all updated");
        } else {
          const maxOrder = rows.length
            ? Math.max(...rows.map((r) => r.sort_order))
            : 0;
          const { error } = await supabase
            .from("brand_email_addresses")
            .insert({
              brand_id: brandId,
              email_address: display,
              is_catch_all: true,
              catch_all_domain: domain,
              label: formLabel || "Catch-all",
              sort_order: maxOrder + 1,
            });
          if (error) throw error;
          toast.success("Catch-all added");
        }
      }
      await load();
      closeForm();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast.error(
        msg.includes("duplicate") || msg.includes("unique")
          ? "This email address already exists"
          : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  const setPrimary = async (row: Address) => {
    if (row.is_catch_all) {
      toast.error("A catch-all cannot be primary");
      return;
    }
    setBusy(true);
    try {
      // Clear current primary first to satisfy partial unique index
      const current = rows.find((r) => r.is_primary && r.id !== row.id);
      if (current) {
        const { error } = await supabase
          .from("brand_email_addresses")
          .update({ is_primary: false })
          .eq("id", current.id);
        if (error) throw error;
      }
      const { error: e2 } = await supabase
        .from("brand_email_addresses")
        .update({ is_primary: true })
        .eq("id", row.id);
      if (e2) throw e2;
      toast.success("Primary updated");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("brand_email_addresses")
        .delete()
        .eq("id", deleting.id);
      if (error) throw error;
      toast.success("Address removed");
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const replyDefaultRow = rows.find((r) => r.is_reply_default && !r.is_catch_all);
  const replyValue = replyDefaultRow?.id ?? FOLLOW_INCOMING;

  const setReplyDefault = async (value: string) => {
    setBusy(true);
    try {
      // Clear all reply defaults for this brand
      const current = rows.filter((r) => r.is_reply_default);
      for (const r of current) {
        const { error } = await supabase
          .from("brand_email_addresses")
          .update({ is_reply_default: false })
          .eq("id", r.id);
        if (error) throw error;
      }
      if (value !== FOLLOW_INCOMING) {
        const { error } = await supabase
          .from("brand_email_addresses")
          .update({ is_reply_default: true })
          .eq("id", value);
        if (error) throw error;
      }
      toast.success("Reply default updated");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-border surface-2 p-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm">Email addresses</Label>
          <p className="text-xs text-muted-foreground">
            All addresses that route to this brand. Star marks the primary.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No addresses yet — add the first one below.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-2 px-3 py-2 text-sm"
            >
              <button
                type="button"
                onClick={() => setPrimary(row)}
                disabled={busy || row.is_catch_all}
                className="text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                title={
                  row.is_catch_all
                    ? "Catch-all cannot be primary"
                    : row.is_primary
                      ? "Primary"
                      : "Set as primary"
                }
              >
                {row.is_catch_all ? (
                  <Globe className="h-4 w-4" />
                ) : (
                  <Star
                    className={`h-4 w-4 ${row.is_primary ? "fill-primary text-primary" : ""}`}
                  />
                )}
              </button>
              <span className="font-mono">{row.email_address}</span>
              {row.is_primary && !row.is_catch_all && (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                  Primary
                </span>
              )}
              {row.label && (
                <span className="rounded surface-3 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {row.label}
                </span>
              )}
              <div className="ml-auto flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => openEdit(row)}
                  disabled={busy}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => setDeleting(row)}
                  disabled={busy}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <div className="space-y-1.5 border-t border-border pt-3">
          <Label className="text-xs">Default reply-from for this brand</Label>
          <Select value={replyValue} onValueChange={setReplyDefault} disabled={busy}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FOLLOW_INCOMING}>
                Follow incoming (reply from address mail was sent to)
              </SelectItem>
              {rows
                .filter((r) => !r.is_catch_all)
                .map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.email_address} (always)
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => openAdd("address")}
        >
          <Mail className="mr-2 h-4 w-4" />
          Add email address
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => openAdd("catchall")}
        >
          <Globe className="mr-2 h-4 w-4" />
          Add catch-all domain
        </Button>
      </div>

      {/* Add / edit dialog */}
      <Dialog open={addOpen !== null} onOpenChange={(o) => !o && closeForm()}>
        <DialogContent className="surface-1 max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit" : "Add"}{" "}
              {addOpen === "catchall" ? "catch-all domain" : "email address"}
            </DialogTitle>
            <DialogDescription>
              {addOpen === "catchall"
                ? "Catches every address on this domain that isn't explicitly listed."
                : "An explicit address that should route to this brand."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {addOpen === "address" ? (
              <div className="space-y-1.5">
                <Label htmlFor="addr-email">Email address</Label>
                <Input
                  id="addr-email"
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="info@vanxcel.com"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="addr-domain">Domain</Label>
                <Input
                  id="addr-domain"
                  value={formDomain}
                  onChange={(e) => setFormDomain(e.target.value)}
                  placeholder="vanxcel.com"
                />
                <p className="text-xs text-muted-foreground">
                  Will display as <span className="font-mono">*@{formDomain || "domain"}</span>
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="addr-label">Label (optional)</Label>
              <Input
                id="addr-label"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder={
                  addOpen === "catchall" ? "Catch-all" : "Support, Sales, Orders…"
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeForm} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitForm} disabled={busy}>
              {busy ? "Saving…" : editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent className="surface-1">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this address?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono">{deleting?.email_address}</span> will
              no longer route new mail. Existing messages stay linked to this
              brand via <span className="font-mono">matched_email_address</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={busy}>
              {busy ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
