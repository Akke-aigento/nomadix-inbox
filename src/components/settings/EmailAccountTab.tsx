import { forwardRef, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Clock, RefreshCw, Sparkles, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
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
import { ensureNoActiveSync } from "@/lib/sync-guard";

import { useI18n, useT } from "@/i18n";
import { fmtDateTime } from "@/i18n/format";
import { TableSkeleton } from "@/components/settings/TableSkeleton";
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
  sync_enabled: boolean;
  vault_secret_id: string | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
}

type AccountForm = Pick<
  EmailAccount,
  | "label"
  | "imap_host"
  | "imap_port"
  | "imap_use_tls"
  | "smtp_host"
  | "smtp_port"
  | "smtp_use_tls"
  | "username"
  | "sync_enabled"
>;

const newAccountDefaults: AccountForm = {
  label: "Nieuw account",
  imap_host: "imap.migadu.com",
  imap_port: 993,
  imap_use_tls: true,
  smtp_host: "smtp.migadu.com",
  smtp_port: 465,
  smtp_use_tls: true,
  username: "",
  sync_enabled: false,
};

const POLL_INTERVAL_MS = 2000;
const HEARTBEAT_STALE_MS = 60_000; // run is dead if no heartbeat in 60s
const MAX_BATCHES = 20; // safety cap on auto-continued batches

const SELECT_COLUMNS =
  "id, label, imap_host, imap_port, imap_use_tls, smtp_host, smtp_port, smtp_use_tls, username, sync_enabled, vault_secret_id, last_sync_at, last_sync_status, last_sync_error";

function toForm(a: EmailAccount): AccountForm {
  return {
    label: a.label,
    imap_host: a.imap_host,
    imap_port: a.imap_port,
    imap_use_tls: a.imap_use_tls,
    smtp_host: a.smtp_host,
    smtp_port: a.smtp_port,
    smtp_use_tls: a.smtp_use_tls,
    username: a.username,
    sync_enabled: a.sync_enabled,
  };
}

export default function EmailAccountTab() {
  const t = useT();
  const { locale } = useI18n();
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [forms, setForms] = useState<Record<string, AccountForm>>({});
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [newForm, setNewForm] = useState<AccountForm | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<EmailAccount | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ fetched: number; batch: number } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [freshRunAccountIds, setFreshRunAccountIds] = useState<string[]>([]);

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
      .select(SELECT_COLUMNS)
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    const rows = (data ?? []) as EmailAccount[];
    setAccounts(rows);
    setForms(Object.fromEntries(rows.map((a) => [a.id, toForm(a)])));
    setPasswords({});
    setLoading(false);
    return rows;
  };

  // On mount: resume polling for a running sync with a fresh heartbeat.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await load();
      if (cancelled || !rows.length) return;
      const { data: running } = await supabase
        .from("sync_log")
        .select("id, email_account_id, last_heartbeat_at")
        .eq("status", "running")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && running?.id && running.email_account_id) {
        const hb = running.last_heartbeat_at ? new Date(running.last_heartbeat_at).getTime() : 0;
        if (Date.now() - hb < HEARTBEAT_STALE_MS) {
          setSyncingId(running.email_account_id);
          pollSyncLog(running.id, running.email_account_id, 1);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cross-tab poll: which accounts have a fresh-heartbeat running sync?
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const cutoff = new Date(Date.now() - HEARTBEAT_STALE_MS).toISOString();
      const { data } = await supabase
        .from("sync_log")
        .select("email_account_id")
        .eq("status", "running")
        .gte("last_heartbeat_at", cutoff);
      if (!cancelled) {
        setFreshRunAccountIds(
          ((data ?? []) as { email_account_id: string | null }[])
            .map((r) => r.email_account_id)
            .filter((x): x is string => !!x),
        );
      }
    };
    check();
    const i = window.setInterval(check, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(i);
    };
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
        setSyncingId(null);
        setSyncProgress(null);
        toast.error(error.message);
        return;
      }
      if (!data) {
        clearPoll();
        setSyncingId(null);
        setSyncProgress(null);
        return;
      }

      const hb = data.last_heartbeat_at ? new Date(data.last_heartbeat_at).getTime() : 0;
      if (data.status === "running" && Date.now() - hb > HEARTBEAT_STALE_MS) {
        clearPoll();
        setSyncingId(null);
        setSyncProgress(null);
        toast.error(t("settings.email.stalled"));
        await load();
        return;
      }

      if (data.status === "running") {
        setSyncProgress({ fetched: data.messages_fetched ?? 0, batch: batchNum });
        pollTimerRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }

      clearPoll();
      const fetched = data.messages_fetched ?? 0;

      if (data.status === "batch_done" && batchNum < MAX_BATCHES) {
        toast.info(t("settings.email.batchDone", { n: batchNum, count: fetched }));
        await continueBatch(accountId, batchNum + 1);
        return;
      }

      setSyncingId(null);
      setSyncProgress(null);
      if (data.status === "ok") {
        toast.success(t("settings.email.syncDone", { count: fetched }));
      } else if (data.status === "batch_done") {
        toast.warning(t("settings.email.syncStopped", { count: MAX_BATCHES }));
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
      const guard = await ensureNoActiveSync(accountId);
      if (guard.ok === false) {
        setSyncingId(null);
        setSyncProgress(null);
        toast.error(guard.reason);
        return;
      }
      const { data, error } = await supabase.functions.invoke("sync-inbox", {
        body: { account_id: accountId },
      });
      if (error) throw error;
      const result = data as { sync_log_id?: string; error?: string };
      if (!result.sync_log_id) {
        setSyncingId(null);
        setSyncProgress(null);
        toast.error(result.error ?? "Failed to continue sync");
        return;
      }
      pollSyncLog(result.sync_log_id, accountId, batchNum);
    } catch (err) {
      setSyncingId(null);
      setSyncProgress(null);
      toast.error(err instanceof Error ? err.message : "Continue failed");
    }
  };

  const setField = <K extends keyof AccountForm>(id: string, k: K, v: AccountForm[K]) =>
    setForms((f) => ({ ...f, [id]: { ...f[id], [k]: v } }));

  const setNewField = <K extends keyof AccountForm>(k: K, v: AccountForm[K]) =>
    setNewForm((f) => (f ? { ...f, [k]: v } : f));

  const saveExisting = async (account: EmailAccount) => {
    const form = forms[account.id];
    if (!form?.username) {
      toast.error(t("settings.email.errUsername"));
      return;
    }
    setBusyId(account.id);
    try {
      const { error } = await supabase.from("email_accounts").update(form).eq("id", account.id);
      if (error) throw error;

      const pwd = passwords[account.id];
      if (pwd) {
        const { error: rpcErr } = await supabase.rpc("upsert_email_account_password", {
          account_id: account.id,
          new_password: pwd,
        });
        if (rpcErr) throw rpcErr;
      }
      toast.success(t("settings.email.saved"));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.email.saveFailed"));
    } finally {
      setBusyId(null);
    }
  };

  const createAccount = async () => {
    if (!newForm?.username) {
      toast.error(t("settings.email.errUsername"));
      return;
    }
    setBusyId("new");
    try {
      const { data, error } = await supabase
        .from("email_accounts")
        .insert(newForm)
        .select("id")
        .single();
      if (error) throw error;
      if (newPassword) {
        const { error: rpcErr } = await supabase.rpc("upsert_email_account_password", {
          account_id: data.id,
          new_password: newPassword,
        });
        if (rpcErr) throw rpcErr;
      }
      setNewForm(null);
      setNewPassword("");
      toast.success(t("settings.email.added"));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.email.addFailed"));
    } finally {
      setBusyId(null);
    }
  };

  const deleteAccount = async (account: EmailAccount) => {
    setBusyId(account.id);
    try {
      const { error } = await supabase.from("email_accounts").delete().eq("id", account.id);
      if (error) throw error;
      toast.success(t("settings.email.removed"));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.email.deleteFailed"));
    } finally {
      setBusyId(null);
      setDeleteTarget(null);
    }
  };

  const test = async (account: EmailAccount) => {
    if (!account.vault_secret_id) {
      toast.error(t("settings.email.errNoPassword"));
      return;
    }
    setTestingId(account.id);
    try {
      const { data, error } = await supabase.functions.invoke("test-email-connection", {
        body: { account_id: account.id },
      });
      if (error) throw error;
      const result = data as { ok: boolean; mailbox_size?: number; error?: string };
      if (result.ok) {
        toast.success(t("settings.email.connected", { count: result.mailbox_size }));
      } else {
        toast.error(result.error ?? t("settings.email.connectFailed"));
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.email.testFailed"));
    } finally {
      setTestingId(null);
    }
  };

  const syncNow = async (account: EmailAccount) => {
    if (!account.vault_secret_id) {
      toast.error(t("settings.email.errNoPassword"));
      return;
    }
    const guard = await ensureNoActiveSync(account.id);
    if (guard.ok === false) {
      toast.error(guard.reason);
      return;
    }
    setSyncingId(account.id);
    setSyncProgress({ fetched: 0, batch: 1 });
    try {
      const { data, error } = await supabase.functions.invoke("sync-inbox", {
        body: { account_id: account.id },
      });
      if (error) throw error;
      const result = data as { sync_log_id?: string; error?: string };
      if (!result.sync_log_id) {
        setSyncingId(null);
        setSyncProgress(null);
        toast.error(result.error ?? "Sync starten mislukt");
        return;
      }
      toast.info(t("settings.email.syncStarted"));
      pollSyncLog(result.sync_log_id, account.id, 1);
    } catch (err) {
      setSyncingId(null);
      setSyncProgress(null);
      toast.error(err instanceof Error ? err.message : "Sync mislukt");
    }
  };

  const analyzeBacklog = async () => {
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-message", {
        body: { limit: 50 },
      });
      if (error) throw error;
      const result = data as {
        analyzed?: number;
        errors?: number;
        skipped?: number;
        total?: number;
        error?: string;
      };
      if (result.error) {
        toast.error(result.error);
      } else if (!result.total) {
        toast.success(t("settings.email.nothingToAnalyze"));
      } else {
        const parts = [`${result.analyzed ?? 0} geanalyseerd`];
        if ((result.skipped ?? 0) > 0) parts.push(`${result.skipped} overgeslagen`);
        if ((result.errors ?? 0) > 0) parts.push(`${result.errors} fouten`);
        toast.success(t("settings.email.analysisDone", { summary: parts.join(", ") }));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.email.analyzeFailed"));
    } finally {
      setAnalyzing(false);
    }
  };

  const statusBadge = (s: string | null) => {
    if (!s) return <Badge variant="secondary">{t("settings.email.notTested")}</Badge>;
    if (s === "ok")
      return (
        <Badge className="bg-success text-success-foreground hover:bg-success/90">
          <CheckCircle2 className="h-3 w-3" /> OK
        </Badge>
      );
    if (s === "partial")
      return (
        <Badge className="bg-warning text-warning-foreground hover:bg-warning/90">
          <Clock className="h-3 w-3" /> {t("settings.email.partial")}
        </Badge>
      );
    return (
      <Badge variant="destructive">
        <XCircle className="h-3 w-3" /> {t("settings.email.error")}
      </Badge>
    );
  };

  if (loading) return <TableSkeleton rows={5} />;

  const renderFields = (
    form: AccountForm,
    onChange: <K extends keyof AccountForm>(k: K, v: AccountForm[K]) => void,
    idPrefix: string,
    passwordValue: string,
    onPassword: (v: string) => void,
    hasStoredPassword: boolean,
  ) => (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-label`}>{t("settings.email.label")}</Label>
        <Input
          id={`${idPrefix}-label`}
          value={form.label}
          onChange={(e) => onChange("label", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-imap-host`}>{t("settings.email.imapHost")}</Label>
        <Input
          id={`${idPrefix}-imap-host`}
          value={form.imap_host}
          onChange={(e) => onChange("imap_host", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-imap-port`}>{t("settings.email.imapPort")}</Label>
        <Input
          id={`${idPrefix}-imap-port`}
          type="number"
          value={form.imap_port}
          onChange={(e) => onChange("imap_port", Number(e.target.value))}
        />
      </div>
      <div className="flex items-center justify-between rounded-md border border-border surface-2 px-3 py-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-imap-tls`} className="text-sm font-normal">
          {t("settings.email.imapTls")}
        </Label>
        <Switch
          id={`${idPrefix}-imap-tls`}
          checked={form.imap_use_tls}
          onCheckedChange={(v) => onChange("imap_use_tls", v)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-smtp-host`}>{t("settings.email.smtpHost")}</Label>
        <Input
          id={`${idPrefix}-smtp-host`}
          value={form.smtp_host}
          onChange={(e) => onChange("smtp_host", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-smtp-port`}>{t("settings.email.smtpPort")}</Label>
        <Input
          id={`${idPrefix}-smtp-port`}
          type="number"
          value={form.smtp_port}
          onChange={(e) => onChange("smtp_port", Number(e.target.value))}
        />
      </div>
      <div className="flex items-center justify-between rounded-md border border-border surface-2 px-3 py-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-smtp-tls`} className="text-sm font-normal">
          {t("settings.email.smtpTls")}
        </Label>
        <Switch
          id={`${idPrefix}-smtp-tls`}
          checked={form.smtp_use_tls}
          onCheckedChange={(v) => onChange("smtp_use_tls", v)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-username`}>{t("settings.email.username")}</Label>
        <Input
          id={`${idPrefix}-username`}
          autoComplete="username"
          value={form.username}
          onChange={(e) => onChange("username", e.target.value)}
          placeholder="send@vanxcel.com"
        />
        <p className="text-xs text-muted-foreground">
          Het domein hiervan bepaalt vanaf welke adressen dit account mag verzenden.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-password`}>{t("settings.email.password")}</Label>
        <Input
          id={`${idPrefix}-password`}
          type="password"
          autoComplete="new-password"
          value={passwordValue}
          onChange={(e) => onPassword(e.target.value)}
          placeholder={hasStoredPassword ? "•••••• opgeslagen in Vault" : "Migadu-wachtwoord"}
        />
        <p className="text-xs text-muted-foreground">
          Versleuteld opgeslagen. Laat leeg om het huidige wachtwoord te behouden.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-md border border-border surface-2 px-3 py-2 sm:col-span-2">
        <div>
          <Label htmlFor={`${idPrefix}-sync`} className="text-sm font-normal">
            {t("settings.email.syncEnabled")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("settings.email.syncEnabledHelp")}
          </p>
        </div>
        <Switch
          id={`${idPrefix}-sync`}
          checked={form.sync_enabled}
          onCheckedChange={(v) => onChange("sync_enabled", v)}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{t("settings.email.title")}</h2>
          <p className="text-xs text-muted-foreground">
            Eén account per domein — Migadu staat verzenden alleen toe vanaf het eigen domein.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={analyzeBacklog}
            disabled={analyzing || !!syncingId || !!testingId}
            title={t("settings.email.analyzeTitle")}
          >
            <Sparkles className={`h-4 w-4 ${analyzing ? "animate-pulse" : ""}`} />
            {analyzing ? t("settings.email.analyzing") : t("settings.email.analyzeBacklog")}
          </Button>
          <Button onClick={() => setNewForm({ ...newAccountDefaults })} disabled={!!newForm}>
            <Plus className="h-4 w-4" /> {t("settings.email.add")}
          </Button>
        </div>
      </div>

      {accounts.length === 0 && !newForm && (
        <Card className="surface-1 border-border p-5 text-sm text-muted-foreground">
          Nog geen e-mailaccounts. Voeg er één toe per domein waarvan je wilt verzenden.
        </Card>
      )}

      {accounts.map((account) => {
        const form = forms[account.id];
        if (!form) return null;
        const hasFreshRun = freshRunAccountIds.includes(account.id);
        const isSyncing = syncingId === account.id;
        return (
          <Card key={account.id} className="surface-1 border-border p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold">{account.label}</h3>
                <p className="text-xs text-muted-foreground">{account.username}</p>
              </div>
              <div className="flex items-center gap-2">
                {statusBadge(account.last_sync_status)}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteTarget(account)}
                  disabled={busyId === account.id || isSyncing}
                  title={t("settings.email.delete")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {renderFields(
              form,
              (k, v) => setField(account.id, k, v),
              account.id,
              passwords[account.id] ?? "",
              (v) => setPasswords((p) => ({ ...p, [account.id]: v })),
              !!account.vault_secret_id,
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Stat label={t("settings.email.lastSync")}>
                <span className="inline-flex items-center gap-1 text-sm">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  {account.last_sync_at
                    ? fmtDateTime(account.last_sync_at, locale)
                    : t("settings.email.never")}
                </span>
              </Stat>
              <Stat label={t("settings.email.lastError")}>
                <span className="text-sm text-muted-foreground">
                  {account.last_sync_error ?? "—"}
                </span>
              </Stat>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => test(account)}
                disabled={testingId === account.id || isSyncing || busyId === account.id}
              >
                {testingId === account.id ? t("settings.email.testing") : t("settings.email.test")}
              </Button>
              <Button
                variant="outline"
                onClick={() => syncNow(account)}
                disabled={isSyncing || !!testingId || busyId === account.id || hasFreshRun}
              >
                <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing
                  ? syncProgress
                    ? `Syncen… (${syncProgress.fetched}${syncProgress.batch > 1 ? `, batch ${syncProgress.batch}` : ""})`
                    : "Syncen…"
                  : t("settings.email.syncNow")}
              </Button>
              <Button onClick={() => saveExisting(account)} disabled={busyId === account.id}>
                {busyId === account.id ? "Opslaan…" : "Wijzigingen opslaan"}
              </Button>
            </div>
          </Card>
        );
      })}

      {newForm && (
        <Card className="surface-1 border-border p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold">{t("settings.email.newAccount")}</h3>
            <p className="text-xs text-muted-foreground">
              {t("settings.email.newAccountHelp")}
            </p>
          </div>

          {renderFields(newForm, setNewField, "new", newPassword, setNewPassword, false)}

          <div className="mt-5 flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setNewForm(null);
                setNewPassword("");
              }}
              disabled={busyId === "new"}
            >
              Annuleren
            </Button>
            <Button onClick={createAccount} disabled={busyId === "new"}>
              {busyId === "new" ? "Aanmaken…" : "Account aanmaken"}
            </Button>
          </div>
        </Card>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.email.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.username} wordt verwijderd. Verzenden vanaf dit domein werkt daarna
              niet meer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteAccount(deleteTarget)}>
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
