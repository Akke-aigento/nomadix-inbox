import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Clock, RefreshCw, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface EmailAccount {
  id: string;
  label: string;
  imap_host: string;
  imap_port: number;
  imap_use_tls: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_use_tls: boolean;
  username: string;
  vault_secret_id: string | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
}

const defaults: Omit<EmailAccount, "id" | "vault_secret_id" | "last_sync_at" | "last_sync_status" | "last_sync_error"> =
  {
    label: "Migadu Main",
    imap_host: "imap.migadu.com",
    imap_port: 993,
    imap_use_tls: true,
    smtp_host: "smtp.migadu.com",
    smtp_port: 465,
    smtp_use_tls: true,
    username: "",
  };

export default function EmailAccountTab() {
  const [account, setAccount] = useState<EmailAccount | null>(null);
  const [form, setForm] = useState(defaults);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("email_accounts")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) toast.error(error.message);
    if (data) {
      setAccount(data as EmailAccount);
      setForm({
        label: data.label,
        imap_host: data.imap_host,
        imap_port: data.imap_port,
        imap_use_tls: data.imap_use_tls,
        smtp_host: data.smtp_host,
        smtp_port: data.smtp_port,
        smtp_use_tls: data.smtp_use_tls,
        username: data.username,
      });
    } else {
      setAccount(null);
      setForm(defaults);
    }
    setPassword("");
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.username) {
      toast.error("Username is required");
      return;
    }
    setBusy(true);
    try {
      let accountId = account?.id;
      if (account) {
        const { error } = await supabase
          .from("email_accounts")
          .update(form)
          .eq("id", account.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("email_accounts")
          .insert(form)
          .select("id")
          .single();
        if (error) throw error;
        accountId = data.id;
      }

      if (password && accountId) {
        const { error: rpcErr } = await supabase.rpc("upsert_email_account_password", {
          account_id: accountId,
          new_password: password,
        });
        if (rpcErr) throw rpcErr;
      }

      toast.success("Saved");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (!account) {
      toast.error("Save the account first");
      return;
    }
    if (!account.vault_secret_id && !password) {
      toast.error("Set a password and save before testing");
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-email-connection", {
        body: { account_id: account.id },
      });
      if (error) throw error;
      const result = data as { ok: boolean; mailbox_size?: number; error?: string };
      if (result.ok) {
        toast.success(`Connected — INBOX has ${result.mailbox_size} messages`);
      } else {
        toast.error(result.error ?? "Connection failed");
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const syncNow = async () => {
    if (!account) {
      toast.error("Save the account first");
      return;
    }
    if (!account.vault_secret_id) {
      toast.error("Set a password and save before syncing");
      return;
    }
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-inbox", {
        body: { account_id: account.id },
      });
      if (error) throw error;
      const result = data as {
        fetched?: number;
        created?: number;
        skipped?: number;
        errors?: number;
        error?: string;
      };
      if (result.error) {
        toast.error(result.error);
      } else {
        const parts = [
          `${result.fetched ?? 0} fetched`,
          `${result.created ?? 0} new`,
          `${result.skipped ?? 0} duplicates`,
        ];
        if ((result.errors ?? 0) > 0) parts.push(`${result.errors} errors`);
        toast.success(`Sync done — ${parts.join(", ")}`);
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const analyzeBacklog = async () => {
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-message", {
        body: { limit: 50 },
      });
      if (error) throw error;
      const result = data as { analyzed?: number; errors?: number; skipped?: number; total?: number; error?: string };
      if (result.error) {
        toast.error(result.error);
      } else if (!result.total) {
        toast.success("Nothing to analyze — all messages have summaries");
      } else {
        const parts = [`${result.analyzed ?? 0} analyzed`];
        if ((result.skipped ?? 0) > 0) parts.push(`${result.skipped} skipped`);
        if ((result.errors ?? 0) > 0) parts.push(`${result.errors} errors`);
        toast.success(`AI analysis — ${parts.join(", ")}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const statusBadge = () => {
    const s = account?.last_sync_status;
    if (!s) return <Badge variant="secondary">Never tested</Badge>;
    if (s === "ok")
      return (
        <Badge className="bg-success text-success-foreground hover:bg-success/90">
          <CheckCircle2 className="h-3 w-3" /> OK
        </Badge>
      );
    return (
      <Badge variant="destructive">
        <XCircle className="h-3 w-3" /> Error
      </Badge>
    );
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <Card className="surface-1 border-border p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold">Migadu account</h2>
          <p className="text-xs text-muted-foreground">
            All Cloudflare Email Routing aliases land in this single mailbox.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="label">Label</Label>
            <Input id="label" value={form.label} onChange={(e) => set("label", e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="imap_host">IMAP host</Label>
            <Input
              id="imap_host"
              value={form.imap_host}
              onChange={(e) => set("imap_host", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="imap_port">IMAP port</Label>
            <Input
              id="imap_port"
              type="number"
              value={form.imap_port}
              onChange={(e) => set("imap_port", Number(e.target.value))}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border surface-2 px-3 py-2 sm:col-span-2">
            <Label htmlFor="imap_tls" className="text-sm font-normal">
              IMAP uses TLS
            </Label>
            <Switch
              id="imap_tls"
              checked={form.imap_use_tls}
              onCheckedChange={(v) => set("imap_use_tls", v)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp_host">SMTP host</Label>
            <Input
              id="smtp_host"
              value={form.smtp_host}
              onChange={(e) => set("smtp_host", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="smtp_port">SMTP port</Label>
            <Input
              id="smtp_port"
              type="number"
              value={form.smtp_port}
              onChange={(e) => set("smtp_port", Number(e.target.value))}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border surface-2 px-3 py-2 sm:col-span-2">
            <Label htmlFor="smtp_tls" className="text-sm font-normal">
              SMTP uses TLS
            </Label>
            <Switch
              id="smtp_tls"
              checked={form.smtp_use_tls}
              onCheckedChange={(v) => set("smtp_use_tls", v)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              autoComplete="username"
              value={form.username}
              onChange={(e) => set("username", e.target.value)}
              placeholder="info@vanxcel.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                account?.vault_secret_id ? "•••••• stored in Vault" : "Set Migadu password"
              }
            />
            <p className="text-xs text-muted-foreground">
              Stored encrypted in Supabase Vault. Leave blank to keep the current password.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => load()} disabled={busy}>
            Reset
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : account ? "Save changes" : "Create account"}
          </Button>
        </div>
      </Card>

      <Card className="surface-1 border-border p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Connection status</h2>
            <p className="text-xs text-muted-foreground">
              Verify the IMAP credentials against Migadu.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={test}
              disabled={testing || syncing || !account}
            >
              {testing ? "Testing…" : "Test connection"}
            </Button>
            <Button onClick={syncNow} disabled={syncing || testing || !account}>
              <RefreshCw
                className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
              />
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Status">{statusBadge()}</Stat>
          <Stat label="Last sync">
            <span className="inline-flex items-center gap-1 text-sm">
              <Clock className="h-3 w-3 text-muted-foreground" />
              {account?.last_sync_at
                ? new Date(account.last_sync_at).toLocaleString()
                : "Never"}
            </span>
          </Stat>
          <Stat label="Last error">
            <span className="text-sm text-muted-foreground">
              {account?.last_sync_error ?? "—"}
            </span>
          </Stat>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border surface-2 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
