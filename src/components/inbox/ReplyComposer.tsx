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
import { toast } from "sonner";
import type { MessageRecord } from "./MessageCard";

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
  onSent: () => void;
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

function addressesToList(input: any): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((x) => (typeof x === "string" ? x : x?.address))
    .filter((s) => typeof s === "string" && s.length > 0);
}

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
  draftId: initialDraftId = null,
  initialDraft = null,
}: Props) {
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
    // Reply: to = sender (or reply-to if available)
    return [parentMessage.from_address];
  });
  const [cc, setCc] = useState<string[]>(() => {
    if (initialDraft?.cc_addresses) return addressesToList(initialDraft.cc_addresses);
    if (mode === "replyAll") {
      const others = addressesToList(parentMessage.to_addresses).filter(
        (a) => a.toLowerCase() !== (parentMessage.matched_email_address || "").toLowerCase(),
      );
      const ccs = addressesToList(parentMessage.cc_addresses);
      return Array.from(new Set([...others, ...ccs]));
    }
    return [];
  });
  const [bcc, setBcc] = useState<string[]>(() =>
    initialDraft?.bcc_addresses ? addressesToList(initialDraft.bcc_addresses) : [],
  );
  const [showCc, setShowCc] = useState<boolean>(cc.length > 0);
  const [showBcc, setShowBcc] = useState<boolean>(bcc.length > 0);

  const [subject, setSubject] = useState<string>(
    initialDraft?.subject ?? buildSubject(mode, parentMessage.subject),
  );

  // Body: if existing draft, use that. Otherwise: signature + (forward = quote) + (reply = empty + quote)
  const initialBody = useMemo(() => {
    if (initialDraft?.body_html) return initialDraft.body_html;
    const sig = defaultAccount?.signature_html
      ? `<p></p><p></p>${sanitizeSignature(defaultAccount.signature_html)}`
      : "";
    const quote = quoteOriginal(parentMessage);
    if (mode === "forward") {
      return `<p></p>${sig}<p>---------- Forwarded message ----------</p>${quote}`;
    }
    return `<p></p>${sig}${quote}`;
  }, [initialDraft, defaultAccount, parentMessage, mode]);

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

  // Auto-save (debounced)
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<number | null>(null);
  const lastPayloadRef = useRef<string>("");

  useEffect(() => {
    if (!brandId) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      const payload = {
        draft_id: draftId,
        brand_id: brandId,
        in_reply_to_message_id: parentMessage.id,
        subject,
        body_html: bodyHtml,
        to_addresses: to,
        cc_addresses: cc,
        bcc_addresses: bcc,
      };
      const sig = JSON.stringify(payload);
      if (sig === lastPayloadRef.current) return;
      lastPayloadRef.current = sig;
      setSaveStatus("saving");
      const { data, error } = await supabase.functions.invoke("save-draft", { body: payload });
      if (error) {
        setSaveStatus("idle");
        return;
      }
      if (data?.draft_id && !draftId) setDraftId(data.draft_id);
      setSaveStatus("saved");
      window.setTimeout(() => setSaveStatus("idle"), 1500);
    }, 1500);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, bodyHtml, to, cc, bcc, brandId]);

  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!brandId || !accountId || !fromEmail) {
      toast.error("Missing brand or sender configuration");
      return;
    }
    if (!to.length) {
      toast.error("Add at least one recipient");
      return;
    }
    if (!subject.trim()) {
      toast.error("Subject required");
      return;
    }
    setSending(true);
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
        draft_id: draftId,
      },
    });
    setSending(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Send failed");
      return;
    }
    toast.success("Message sent");
    qc.invalidateQueries({ queryKey: ["thread", threadId] });
    qc.invalidateQueries({ queryKey: ["threads"] });
    onSent();
  };

  const fromOptions = useMemo(() => {
    const set = new Set<string>();
    if (parentMessage.matched_email_address) set.add(parentMessage.matched_email_address);
    brandEmails.forEach((e: any) => set.add(e.email_address));
    accounts.forEach((a) => a.email_alias && set.add(a.email_alias));
    return Array.from(set);
  }, [brandEmails, accounts, parentMessage.matched_email_address]);

  return (
    <div className="rounded-lg border border-border bg-card shadow-md">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium">
            {mode === "reply" && "Reply"}
            {mode === "replyAll" && "Reply all"}
            {mode === "forward" && "Forward"}
          </span>
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Save className="h-3 w-3" /> Saved
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="w-12 flex-none text-xs font-medium text-muted-foreground">From</span>
        <Select value={accountId} onValueChange={onAccountChange}>
          <SelectTrigger className="h-7 w-auto gap-1 border-0 bg-transparent px-2 text-xs hover:bg-muted">
            <SelectValue placeholder="Select sender" />
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

      <RecipientInput label="To" values={to} onChange={setTo} placeholder="recipient@example.com" />
      {showCc ? (
        <RecipientInput label="Cc" values={cc} onChange={setCc} />
      ) : null}
      {showBcc ? (
        <RecipientInput label="Bcc" values={bcc} onChange={setBcc} />
      ) : null}
      {(!showCc || !showBcc) && (
        <div className="flex justify-end gap-3 border-b border-border px-3 py-1 text-[11px]">
          {!showCc && (
            <button onClick={() => setShowCc(true)} className="text-muted-foreground hover:text-foreground">
              Add Cc
            </button>
          )}
          {!showBcc && (
            <button onClick={() => setShowBcc(true)} className="text-muted-foreground hover:text-foreground">
              Add Bcc
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="w-12 flex-none text-xs font-medium text-muted-foreground">Subject</span>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="flex-1 bg-transparent py-1 text-sm focus:outline-none"
          placeholder="Subject"
        />
      </div>

      <div className="p-3">
        <ComposeEditor initialHtml={bodyHtml} onChange={setBodyHtml} />
      </div>

      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <div className="text-[11px] text-muted-foreground">
          ⌘↩ to send
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Discard
          </Button>
          <Button size="sm" onClick={handleSend} disabled={sending}>
            {sending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
