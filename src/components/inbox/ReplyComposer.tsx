import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, X, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ComposeEditor } from "./ComposeEditor";
import { RecipientInput } from "./RecipientInput";
import { sanitizeSignature } from "@/lib/sanitize";
import { addressesToList, primaryReplyTarget } from "@/lib/reply-target";
import { useT } from "@/i18n";
import { toast } from "sonner";
import type { MessageRecord } from "./MessageCard";
import { cn } from "@/lib/utils";

export type ComposeMode = "reply" | "replyAll" | "forward";

interface BrandAccount {
  id: string;
  display_name: string;
  email_alias: string | null;
  signature_html: string;
  is_default: boolean;
  brand_id: string;
}

interface Props {
  threadId: string;
  brandId: string | null;
  parentMessage: MessageRecord;
  mode: ComposeMode;
  onCancel: () => void;
  /** Mobiel: de opsteller vult het scherm; kop en verzendknop blijven staan. */
  fullscreen?: boolean;
  /** `message` is a local stand-in for the sent mail, shown on top until the refetch lands. */
  onSent: (sent: { messageId: string | null; message: MessageRecord }) => void;
  draftId?: string | null;
  initialDraft?: {
    subject: string | null;
    body_html: string | null;
    to_addresses: any;
    cc_addresses: any;
    bcc_addresses: any;
  } | null;
  /**
   * AI-generated seed (no signature, no quote). When provided and no human draft
   * exists, composer hydrates: aiSeed.body_html + signature + quote.
   */
  aiSeed?: { subject: string | null; body_html: string } | null;
}


// Let op: de teksten hieronder gaan de e-mail in en volgen dus NIET de
// UI-taal. "Re:"/"Fwd:" zijn RFC-conventies, de attributieregel hoort bij de
// correspondentie, en "Forwarded message" dient ook als anker waarop de
// signature-swap het gebruikersdeel afknipt (zie onAccountChange).
function buildSubject(mode: ComposeMode, original: string | null): string {
  const base = (original || "").trim();
  const cleaned = base.replace(/^(re|fwd?|aw|antw|tr|fw|wg)\s*:\s*/gi, "").trim();
  if (mode === "forward") return `Fwd: ${cleaned}`;
  return `Re: ${cleaned}`;
}

function quoteOriginal(parent: MessageRecord): string {
  const date = new Date(parent.received_at).toLocaleString();
  const who = parent.from_name
    ? `${parent.from_name} &lt;${parent.from_address}&gt;`
    : parent.from_address;
  const inner = parent.body_html || (parent.body_text || "").replace(/\n/g, "<br/>");
  return `<p></p><p>On ${date}, ${who} wrote:</p><blockquote style="margin:0 0 0 .8ex;border-left:2px solid #ccc;padding-left:1ex">${inner}</blockquote>`;
}

export function ReplyComposer({
  threadId,
  brandId,
  parentMessage,
  mode,
  onCancel,
  onSent,
  fullscreen = false,
  draftId: initialDraftId = null,
  initialDraft = null,
  aiSeed = null,
}: Props) {
  const t = useT();
  const qc = useQueryClient();

  // Load brand_accounts for this brand
  const { data: accounts = [] } = useQuery({
    queryKey: ["brand-accounts", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_accounts")
        .select("id, display_name, email_alias, signature_html, is_default, brand_id")
        .eq("brand_id", brandId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as BrandAccount[];
    },
  });

  // Load brand email addresses (these are the addresses we receive on)
  const { data: brandEmails = [] } = useQuery({
    queryKey: ["brand-emails", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data } = await supabase
        .from("brand_email_addresses")
        .select("email_address, is_primary, is_reply_default")
        .eq("brand_id", brandId!);
      return data || [];
    },
  });

  // Pick best initial brand_account: default account, else first
  const defaultAccount = useMemo(() => {
    if (!accounts.length) return null;
    return accounts.find((a) => a.is_default) ?? accounts[0];
  }, [accounts]);

  const [accountId, setAccountId] = useState<string>("");

  // Pick best from_email: matched_email_address > brand reply_default > brand primary > account alias
  const initialFromEmail = useMemo(() => {
    if (parentMessage.matched_email_address) return parentMessage.matched_email_address;
    const replyDef = brandEmails.find((e: any) => e.is_reply_default);
    if (replyDef) return (replyDef as any).email_address;
    const primary = brandEmails.find((e: any) => e.is_primary);
    if (primary) return (primary as any).email_address;
    return defaultAccount?.email_alias || "";
  }, [parentMessage.matched_email_address, brandEmails, defaultAccount]);

  const [fromEmail, setFromEmail] = useState<string>("");

  useEffect(() => {
    if (!accountId && defaultAccount) setAccountId(defaultAccount.id);
  }, [defaultAccount, accountId]);

  useEffect(() => {
    if (!fromEmail && initialFromEmail) setFromEmail(initialFromEmail);
  }, [initialFromEmail, fromEmail]);

  // Recipients
  const [to, setTo] = useState<string[]>(() => {
    if (initialDraft?.to_addresses) return addressesToList(initialDraft.to_addresses);
    if (mode === "forward") return [];
    // Reply / reply-all: honour Reply-To when present, else the sender.
    return primaryReplyTarget(parentMessage);
  });
  const [cc, setCc] = useState<string[]>(() => {
    if (initialDraft?.cc_addresses) return addressesToList(initialDraft.cc_addresses);
    if (mode === "replyAll") {
      const primary = primaryReplyTarget(parentMessage).map((a) => a.toLowerCase());
      const exclude = new Set(
        [...primary, (parentMessage.matched_email_address || "").toLowerCase()].filter(Boolean),
      );
      const others = addressesToList(parentMessage.to_addresses);
      const ccs = addressesToList(parentMessage.cc_addresses);
      return Array.from(new Set([...others, ...ccs])).filter(
        (a) => !exclude.has(a.toLowerCase()),
      );
    }
    return [];
  });
  const [bcc, setBcc] = useState<string[]>(() =>
    initialDraft?.bcc_addresses ? addressesToList(initialDraft.bcc_addresses) : [],
  );
  const [showCc, setShowCc] = useState<boolean>(cc.length > 0);
  const [showBcc, setShowBcc] = useState<boolean>(bcc.length > 0);

  const [subject, setSubject] = useState<string>(
    initialDraft?.subject ?? aiSeed?.subject ?? buildSubject(mode, parentMessage.subject),
  );

  // Body priority: human draft > AI seed (+sig+quote) > blank (+sig+quote)
  const initialBody = useMemo(() => {
    if (initialDraft?.body_html) return initialDraft.body_html;
    const sig = defaultAccount?.signature_html
      ? `<p></p><p></p>${sanitizeSignature(defaultAccount.signature_html)}`
      : "";
    const quote = quoteOriginal(parentMessage);
    const seedBody = aiSeed?.body_html ? `<p></p>${aiSeed.body_html}` : "<p></p>";
    if (mode === "forward") {
      return `${seedBody}${sig}<p>---------- Forwarded message ----------</p>${quote}`;
    }
    return `${seedBody}${sig}${quote}`;
  }, [initialDraft, aiSeed, defaultAccount, parentMessage, mode]);

  const [bodyHtml, setBodyHtml] = useState<string>(initialBody);

  // When defaultAccount loads after first render, set initial body once
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    if (initialDraft?.body_html) {
      hydratedRef.current = true;
      return;
    }
    if (defaultAccount) {
      setBodyHtml(initialBody);
      hydratedRef.current = true;
    }
  }, [defaultAccount, initialDraft, initialBody]);

  // When user changes brand_account, swap the signature in the body
  const onAccountChange = (newId: string) => {
    markDirty();
    setAccountId(newId);
    const next = accounts.find((a) => a.id === newId);
    if (!next) return;
    // Replace existing signature block heuristically: keep everything before the first <blockquote> or "Forwarded"
    const sig = next.signature_html
      ? `<p></p><p></p>${sanitizeSignature(next.signature_html)}`
      : "";
    const quote = quoteOriginal(parentMessage);
    const userPart = bodyHtml.split(/<p><\/p><p><\/p>/)[0] || "<p></p>";
    if (mode === "forward") {
      setBodyHtml(`${userPart}${sig}<p>---------- Forwarded message ----------</p>${quote}`);
    } else {
      setBodyHtml(`${userPart}${sig}${quote}`);
    }
    if (next.email_alias) setFromEmail(next.email_alias);
  };

  // Auto-save (debounced).
  // - Only after a real user edit: opening the composer (or the signature /
  //   AI seed being filled in) must not create a draft.
  // - One save at a time, reading the draft id at execution time, so a second
  //   save never inserts a duplicate while the first insert is still running.
  const draftIdRef = useRef<string | null>(initialDraftId);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const lastSavedSigRef = useRef<string>("");
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const latestRef = useRef({ subject, bodyHtml, to, cc, bcc });
  latestRef.current = { subject, bodyHtml, to, cc, bcc };

  const markDirty = () => {
    dirtyRef.current = true;
  };

  const saveNow = () => {
    if (!brandId || !dirtyRef.current) return saveChainRef.current;
    saveChainRef.current = saveChainRef.current.then(async () => {
      const cur = latestRef.current;
      const content = {
        brand_id: brandId,
        in_reply_to_message_id: parentMessage.id,
        subject: cur.subject,
        body_html: cur.bodyHtml,
        to_addresses: cur.to,
        cc_addresses: cur.cc,
        bcc_addresses: cur.bcc,
      };
      const sig = JSON.stringify(content);
      if (sig === lastSavedSigRef.current) return;
      setSaveStatus("saving");
      const { data, error } = await supabase.functions.invoke("save-draft", {
        body: { draft_id: draftIdRef.current, ...content },
      });
      if (error) {
        setSaveStatus("idle");
        return;
      }
      lastSavedSigRef.current = sig;
      if (data?.draft_id && !draftIdRef.current) draftIdRef.current = data.draft_id;
      setSaveStatus("saved");
      window.setTimeout(() => setSaveStatus("idle"), 1500);
    });
    return saveChainRef.current;
  };

  useEffect(() => {
    if (!brandId || !dirtyRef.current) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      void saveNow();
    }, 1500);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // saveNow reads everything through refs; re-running on its identity would
    // restart the debounce on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, bodyHtml, to, cc, bcc, brandId]);

  // Close (×): keep the draft, but flush a pending edit first so it isn't lost.
  const handleClose = () => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
      void saveNow();
    }
    onCancel();
  };

  // Discard: throw the draft away, including one that is still being saved.
  const [discarding, setDiscarding] = useState(false);
  const handleDiscard = async () => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    dirtyRef.current = false;
    setDiscarding(true);
    await saveChainRef.current;
    if (draftIdRef.current) {
      const { error } = await supabase.from("drafts").delete().eq("id", draftIdRef.current);
      if (error) {
        setDiscarding(false);
        toast.error(t("inbox.composer.draftDeleteFailed"));
        return;
      }
      draftIdRef.current = null;
      qc.invalidateQueries({ queryKey: ["thread", threadId] });
    }
    setDiscarding(false);
    onCancel();
  };

  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!brandId || !accountId || !fromEmail) {
      toast.error(t("inbox.composer.errMissingConfig"));
      return;
    }
    if (!to.length) {
      toast.error(t("inbox.composer.errNoRecipient"));
      return;
    }
    if (!subject.trim()) {
      toast.error(t("inbox.composer.errNoSubject"));
      return;
    }
    setSending(true);
    // Let an in-flight draft save land first, so send-email deletes the right
    // draft and no save can re-create it afterwards.
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    dirtyRef.current = false;
    await saveChainRef.current;
    const { data, error } = await supabase.functions.invoke("send-email", {
      body: {
        thread_id: threadId,
        in_reply_to_message_id: parentMessage.id,
        brand_id: brandId,
        brand_account_id: accountId,
        from_email: fromEmail,
        to,
        cc,
        bcc,
        subject,
        body_html: bodyHtml,
        draft_id: draftIdRef.current,
      },
    });
    setSending(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || t("inbox.composer.sendFailed"));
      return;
    }
    toast.success(t("inbox.composer.sent"));
    const sentId = (data as { message_id?: string } | null)?.message_id ?? null;
    const sentAccount = accounts.find((a) => a.id === accountId);
    const sentMessage: MessageRecord = {
      id: sentId ?? `local-${Date.now()}`,
      from_address: fromEmail,
      from_name: sentAccount?.display_name ?? null,
      to_addresses: to.map((address) => ({ address })),
      cc_addresses: cc.map((address) => ({ address })),
      subject,
      body_html: bodyHtml,
      body_text: null,
      received_at: new Date().toISOString(),
      matched_email_address: fromEmail,
      is_read: true,
      is_outbound: true,
    };
    // Optimistic first, then refetch: the server copy replaces the stand-in.
    onSent({ messageId: sentId, message: sentMessage });
    qc.invalidateQueries({ queryKey: ["thread", threadId] });
    qc.invalidateQueries({ queryKey: ["threads"] });
  };

  const fromOptions = useMemo(() => {
    const set = new Set<string>();
    if (parentMessage.matched_email_address) set.add(parentMessage.matched_email_address);
    brandEmails.forEach((e: any) => set.add(e.email_address));
    accounts.forEach((a) => a.email_alias && set.add(a.email_alias));
    return Array.from(set);
  }, [brandEmails, accounts, parentMessage.matched_email_address]);

  return (
    <div
      className={cn(
        fullscreen
          ? "flex h-full min-h-0 flex-col bg-background"
          : "rounded-lg border border-border bg-card shadow-md",
      )}
    >
      <div
        className={cn(
          "flex flex-none items-center justify-between gap-2 border-b border-border px-3 py-2",
          fullscreen && "pt-safe",
        )}
      >
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium">
            {mode === "reply" && t("inbox.composer.reply")}
            {mode === "replyAll" && t("inbox.composer.replyAll")}
            {mode === "forward" && t("inbox.composer.forward")}
          </span>
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> {t("inbox.composer.saving")}
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Save className="h-3 w-3" /> {t("inbox.composer.saved")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {fullscreen && (
            <Button size="sm" className="min-h-touch" onClick={handleSend} disabled={sending}>
              {sending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-4 w-4" />
              )}
              {t("inbox.composer.send")}
            </Button>
          )}
          <Button
            variant="ghost"
            size={fullscreen ? "icon-touch" : "icon"}
            className={fullscreen ? undefined : "h-6 w-6"}
            onClick={handleClose}
            title={t("inbox.composer.close")}
          >
            <X className={fullscreen ? "h-5 w-5" : "h-3.5 w-3.5"} />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="w-12 flex-none text-xs font-medium text-muted-foreground">
          {t("inbox.composer.from")}
        </span>
        <Select value={accountId} onValueChange={onAccountChange}>
          <SelectTrigger className="h-7 w-auto gap-1 border-0 bg-transparent px-2 text-xs hover:bg-muted">
            <SelectValue placeholder={t("inbox.composer.selectSender")} />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id} className="text-xs">
                {a.display_name}
                {a.email_alias && <span className="ml-1 text-muted-foreground">&lt;{a.email_alias}&gt;</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fromOptions.length > 1 && (
          <Select value={fromEmail} onValueChange={setFromEmail}>
            <SelectTrigger className="h-7 w-auto gap-1 border-0 bg-transparent px-2 text-xs hover:bg-muted">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fromOptions.map((e) => (
                <SelectItem key={e} value={e} className="text-xs">
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <RecipientInput
        label={t("inbox.composer.to")}
        values={to}
        onChange={(next) => {
          markDirty();
          setTo(next);
        }}
        placeholder={t("inbox.composer.recipientPlaceholder")}
      />
      {showCc ? (
        <RecipientInput
          label={t("inbox.composer.cc")}
          values={cc}
          onChange={(next) => {
            markDirty();
            setCc(next);
          }}
        />
      ) : null}
      {showBcc ? (
        <RecipientInput
          label={t("inbox.composer.bcc")}
          values={bcc}
          onChange={(next) => {
            markDirty();
            setBcc(next);
          }}
        />
      ) : null}
      {(!showCc || !showBcc) && (
        <div className="flex justify-end gap-3 border-b border-border px-3 py-1 text-2xs">
          {!showCc && (
            <button onClick={() => setShowCc(true)} className="text-muted-foreground hover:text-foreground">
              {t("inbox.composer.addCc")}
            </button>
          )}
          {!showBcc && (
            <button onClick={() => setShowBcc(true)} className="text-muted-foreground hover:text-foreground">
              {t("inbox.composer.addBcc")}
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="w-12 flex-none text-xs font-medium text-muted-foreground">
          {t("inbox.composer.subject")}
        </span>
        <input
          value={subject}
          onChange={(e) => {
            markDirty();
            setSubject(e.target.value);
          }}
          className="flex-1 bg-transparent py-1 text-sm focus:outline-none"
          placeholder={t("inbox.composer.subject")}
        />
      </div>

      <div className={cn("p-3", fullscreen && "min-h-0 flex-1 overflow-y-auto")}>
        <ComposeEditor
          autoFocus
          onSubmit={() => {
            if (!sending) void handleSend();
          }}
          initialHtml={bodyHtml}
          onChange={(html, { userEdit }) => {
            if (userEdit) markDirty();
            setBodyHtml(html);
          }}
        />
      </div>

      <div
        className={cn(
          "flex flex-none items-center justify-between border-t border-border px-3 py-2",
          fullscreen && "pb-safe",
        )}
      >
        <div className="text-2xs text-muted-foreground">
          {fullscreen ? "" : t("inbox.composer.sendHint")}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className={fullscreen ? "min-h-touch" : undefined}
            onClick={handleDiscard}
            disabled={discarding || sending}
          >
            {t("inbox.composer.discard")}
          </Button>
          {!fullscreen && (
            <Button size="sm" onClick={handleSend} disabled={sending}>
              {sending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
              {t("inbox.composer.send")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
