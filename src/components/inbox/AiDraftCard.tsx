import { useState } from "react";
import { Sparkles, RefreshCw, Check, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { sanitizeEmailHtml } from "@/lib/sanitize";
import { toast } from "sonner";

export interface AiDraftRow {
  id: string;
  message_id: string;
  draft_subject: string | null;
  draft_body_html: string;
  draft_body_text: string | null;
  status: string;
  reasoning: string | null;
  model_used: string;
  generated_at: string;
}

interface Props {
  draft: AiDraftRow;
  onUse: (draft: AiDraftRow) => void;
  onChanged: () => void;
}

export function AiDraftCard({ draft, onUse, onChanged }: Props) {
  const [busy, setBusy] = useState<"regen" | "discard" | null>(null);

  const isFailed = draft.status === "failed";
  const isPending = draft.status === "pending" || draft.status === "generating";

  const regenerate = async () => {
    setBusy("regen");
    const { error } = await supabase.functions.invoke("generate-draft-reply", {
      body: { message_id: draft.message_id, force: true },
    });
    setBusy(null);
    if (error) {
      toast.error("Could not regenerate draft");
      return;
    }
    toast.success("New draft generated");
    onChanged();
  };

  const discard = async () => {
    setBusy("discard");
    const { error } = await supabase.from("ai_drafts").delete().eq("id", draft.id);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Draft discarded");
    onChanged();
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/[0.04] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 items-center gap-1 rounded-full bg-primary/15 px-2 text-[10px] font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="h-3 w-3" />
            AI Draft
          </span>
          {isFailed && (
            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-medium text-destructive">
              failed
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">{draft.model_used}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={regenerate}
            disabled={busy !== null}
          >
            {busy === "regen" ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3 w-3" />
            )}
            Regenerate
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
            onClick={discard}
            disabled={busy !== null}
          >
            {busy === "discard" ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="mr-1 h-3 w-3" />
            )}
            Discard
          </Button>
          {!isFailed && !isPending && (
            <Button
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => onUse(draft)}
            >
              <Check className="mr-1 h-3 w-3" />
              Use draft
            </Button>
          )}
        </div>
      </div>

      {isFailed ? (
        <div className="text-xs text-destructive">
          {draft.reasoning || "Generation failed. Try regenerate."}
        </div>
      ) : (
        <>
          {draft.draft_subject && (
            <div className="mb-1.5 text-xs font-medium text-foreground">
              {draft.draft_subject}
            </div>
          )}
          <div
            className="ai-draft-body max-h-48 overflow-y-auto rounded border border-border/40 bg-background/60 p-2.5 text-xs text-foreground/90"
            dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(draft.draft_body_html) }}
          />
          {draft.reasoning && (
            <div className="mt-1.5 text-[10px] italic text-muted-foreground">
              {draft.reasoning}
            </div>
          )}
        </>
      )}
    </div>
  );
}
