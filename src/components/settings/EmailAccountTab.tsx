import { forwardRef, useEffect, useRef, useState } from "react";
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

const POLL_INTERVAL_MS = 2000;
const HEARTBEAT_STALE_MS = 60_000; // run is dead if no heartbeat in 60s
const MAX_BATCHES = 20; // safety cap on auto-continued batches

export default function EmailAccountTab() {
  const [account, setAccount] = useState<EmailAccount | null>(null);
  const [form, setForm] = useState(defaults);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ fetched: number; batch: number } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);

  const pollTimerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  const clearPoll = () => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      clearPoll();
    };
  }, []);

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
    return data as EmailAccount | null;
  };

  // On mount: if there's already a running sync_log for this account, resume polling.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const acc = await load();
      if (cancelled || !acc) return;
      const { data: running } = await supabase
        .from("sync_log")
        .select("id, last_heartbeat_at")
        .eq("email_account_id", acc.id)
        .eq("status", "running")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && running?.id) {
        // Only resume if heartbeat is fresh; otherwise show stale + reset.
        const hb = running.last_heartbeat_at
          ? new Date(running.last_heartbeat_at).getTime()
          : 0;
        if (Date.now() - hb < HEARTBEAT_STALE_MS) {
          setSyncing(true);
          pollSyncLog(running.id, acc.id, 1);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pollSyncLog = (logId: string, accountId: string, batchNum: number) => {
    const tick = async () => {
      if (cancelledRef.current) return;
      const { data, error } = await supabase
        .from("sync_log")
        .select("status, messages_fetched, error_message, batch_complete, last_heartbeat_at")
        .eq("id", logId)
        .maybeSingle();
      if (error) {
        clearPoll();
        setSyncing(false);
        setSyncProgress(null);
        toast.error(error.message);
        return;
      }
      if (!data) {
        clearPoll();
        setSyncing(false);
        setSyncProgress(null);
        return;
      }

      // Stale heartbeat → treat as dead
      const hb = data.last_heartbeat_at ? new Date(data.last_heartbeat_at).getTime() : 0;
      if (data.status === "running" && Date.now() - hb > HEARTBEAT_STALE_MS) {
        clearPoll();
        setSyncing(false);
        setSyncProgress(null);
        toast.error("Sync stalled — no heartbeat for over 60s");
        await load();
        return;
      }

      if (data.status === "running") {
        setSyncProgress({ fetched: data.messages_fetched ?? 0, batch: batchNum });
        pollTimerRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }

      // Final state for this batch
      clearPoll();
      const fetched = data.messages_fetched ?? 0;

      // batch_done → more UIDs left, auto-continue with next invocation.
      if (data.status === "batch_done" && batchNum < MAX_BATCHES) {
        toast.info(`Batch ${batchNum} done (${fetched}) — continuing…`);
        await continueBatch(accountId, batchNum + 1);
        return;
      }

      setSyncing(false);
      setSyncProgress(null);
      if (data.status === "ok") {
        toast.success(`Sync done — ${fetched} message${fetched === 1 ? "" : "s"} fetched`);
      } else if (data.status === "batch_done") {
        toast.warning(`Stopped after ${MAX_BATCHES} batches — click Sync again to continue`);
      } else if (data.status === "partial") {
        toast.warning(
          `Sync partial — ${fetched} fetched${data.error_message ? `: ${data.error_message}` : ""}`,
        );
      } else {
        toast.error(data.error_message ?? "Sync failed");
      }
      await load();
    };
    pollTimerRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
  };

  const continueBatch = async (accountId: string, batchNum: number) => {
    try {
      const { data, error } = await supabase.functions.invoke("sync-inbox", {
        body: { account_id: accountId },
      });
      if (error) throw error;
      const result = data as { sync_log_id?: string; error?: string };
      if (!result.sync_log_id) {
        setSyncing(false);
        setSyncProgress(null);
        toast.error(result.error ?? "Failed to continue sync");
        return;
      }
      pollSyncLog(result.sync_log_id, accountId, batchNum);
    } catch (err) {
      setSyncing(false);
      setSyncProgress(null);
      toast.error(err instanceof Error ? err.message : "Continue failed");
    }
  };

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
    setSyncProgress({ fetched: 0, batch: 1 });
    try {
      const { data, error } = await supabase.functions.invoke("sync-inbox", {
        body: { account_id: account.id },
      });
      if (error) throw error;
      const result = data as { sync_log_id?: string; error?: string };
      if (!result.sync_log_id) {
        setSyncing(false);
        setSyncProgress(null);
        toast.error(result.error ?? "Failed to start sync");
        return;
      }
      toast.info("Sync started — fetching new mail…");
      pollSyncLog(result.sync_log_id, account.id, 1);
    } catch (err) {
      setSyncing(false);
      setSyncProgress(null);
      toast.error(err instanceof Error ? err.message : "Sync failed");
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
    if (s === "partial")
      return (
        <Badge className="bg-warning text-warning-foreground hover:bg-warning/90">
          <Clock className="h-3 w-3" /> Partial
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
              disabled={testing || syncing || analyzing || !account}
            >
              {testing ? "Testing…" : "Test connection"}
            </Button>
            <Button
              variant="outline"
              onClick={analyzeBacklog}
              disabled={analyzing || syncing || testing}
              title="Run AI analysis on messages without a summary"
            >
              <Sparkles className={`h-4 w-4 ${analyzing ? "animate-pulse" : ""}`} />
              {analyzing ? "Analyzing…" : "Analyze backlog"}
            </Button>
            <Button onClick={syncNow} disabled={syncing || testing || analyzing || !account}>
              <RefreshCw
                className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
              />
              {syncing
                ? syncProgress
                  ? `Syncing… (${syncProgress.fetched}${syncProgress.batch > 1 ? `, batch ${syncProgress.batch}` : ""})`
                  : "Syncing…"
                : "Sync now"}
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

const Stat = forwardRef<HTMLDivElement, { label: string; children: React.ReactNode }>(
  ({ label, children }, ref) => (
    <div ref={ref} className="rounded-md border border-border surface-2 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  ),
);
Stat.displayName = "Stat";
