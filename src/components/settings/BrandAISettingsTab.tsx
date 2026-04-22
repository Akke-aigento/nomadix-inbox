import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { Brand } from "./BrandFormDialog";

interface Props {
  brand: Brand;
}

interface LabelRow {
  id: string;
  name: string;
  color: string;
}

const TONE_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "warm", label: "Warm" },
  { value: "concise", label: "Concise" },
];

const LANG_OPTIONS = [
  { value: "auto", label: "Auto-detect" },
  { value: "nl", label: "Nederlands" },
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
];

const MODE_OPTIONS = [
  { value: "off", label: "Off — never auto-generate" },
  { value: "all_inbound", label: "For every inbound message" },
  { value: "customer_only", label: "Only for customer messages" },
  { value: "labeled", label: "Only for messages with specific labels" },
];

const VOICE_PLACEHOLDER = `Beschrijf hoe deze brand communiceert. Bijvoorbeeld:

"SellQo is een multi-tenant e-commerce platform. Communicatie is technisch-onderbouwd maar toegankelijk. We tutoyeren klanten (je/jij). Antwoorden zijn concreet en bevatten waar mogelijk een volgende stap. Geen jargon zonder uitleg."`;

export default function BrandAISettingsTab({ brand }: Props) {
  const [enabled, setEnabled] = useState<boolean>(brand.ai_auto_draft_enabled ?? false);
  const [mode, setMode] = useState<string>(brand.ai_draft_mode ?? "off");
  const [tone, setTone] = useState<string>(brand.ai_draft_tone ?? "professional");
  const [language, setLanguage] = useState<string>(brand.ai_draft_language ?? "auto");
  const [triggerLabels, setTriggerLabels] = useState<string[]>(brand.ai_draft_trigger_labels ?? []);
  const [voice, setVoice] = useState<string>(brand.brand_voice ?? "");
  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEnabled(brand.ai_auto_draft_enabled ?? false);
    setMode(brand.ai_draft_mode ?? "off");
    setTone(brand.ai_draft_tone ?? "professional");
    setLanguage(brand.ai_draft_language ?? "auto");
    setTriggerLabels(brand.ai_draft_trigger_labels ?? []);
    setVoice(brand.brand_voice ?? "");
  }, [brand.id]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("labels").select("id,name,color").order("name");
      setLabels((data ?? []) as LabelRow[]);
    })();
  }, []);

  const wordCount = voice.trim().split(/\s+/).filter(Boolean).length;
  const overLimit = wordCount > 500;

  const toggleTriggerLabel = (name: string) => {
    setTriggerLabels((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  };

  const save = async () => {
    if (overLimit) {
      toast.error("Brand voice exceeds 500 words");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("brands")
      .update({
        ai_auto_draft_enabled: enabled,
        ai_draft_mode: mode,
        ai_draft_tone: tone,
        ai_draft_language: language,
        ai_draft_trigger_labels: triggerLabels,
        brand_voice: voice || null,
      })
      .eq("id", brand.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("AI settings saved");
  };

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-md border border-border surface-1 p-4">
        <div>
          <h3 className="text-sm font-semibold">AI Draft Replies</h3>
          <p className="text-xs text-muted-foreground">
            Generate concept replies automatically for inbound messages.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border surface-2 px-3 py-2">
          <Label htmlFor="ai_auto_draft_enabled" className="cursor-pointer">
            Automatische concept-antwoorden genereren
          </Label>
          <Switch
            id="ai_auto_draft_enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {enabled && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-3">
              <Label>Wanneer?</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {mode === "labeled" && (
              <div className="space-y-2 sm:col-span-3">
                <Label>Trigger labels</Label>
                <div className="flex flex-wrap gap-2 rounded-md border border-border surface-2 p-2">
                  {labels.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      No labels yet. Create labels in the Labels tab.
                    </span>
                  ) : (
                    labels.map((l) => {
                      const active = triggerLabels.includes(l.name);
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => toggleTriggerLabel(l.name)}
                        >
                          <Badge
                            variant={active ? "default" : "secondary"}
                            style={
                              active
                                ? { backgroundColor: l.color, color: "#fff" }
                                : undefined
                            }
                          >
                            {l.name}
                          </Badge>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Toon</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Taal</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANG_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-md border border-border surface-1 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Brand Voice</h3>
            <p className="text-xs text-muted-foreground">
              Injected into the AI system prompt when drafting replies.
            </p>
          </div>
          <span
            className={`text-xs ${overLimit ? "text-destructive" : "text-muted-foreground"}`}
          >
            {wordCount} / 500 words
          </span>
        </div>
        <Textarea
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          rows={10}
          placeholder={VOICE_PLACEHOLDER}
        />
      </section>

      <div className="flex justify-end">
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save AI settings"}
        </Button>
      </div>
    </div>
  );
}
