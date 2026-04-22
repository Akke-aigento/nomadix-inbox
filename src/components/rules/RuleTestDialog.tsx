import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";
import type { RoutingRule } from "./RoutingRuleFormDialog";

interface MessageRow {
  id: string;
  from_address: string;
  from_name: string | null;
  subject: string | null;
  to_addresses: unknown;
  brand_id: string | null;
  raw_headers: unknown;
  received_at: string;
}

interface Props {
  rule: RoutingRule | null;
  onClose: () => void;
}

function jsonContains(value: unknown, needle: string): boolean {
  if (!needle) return true;
  if (value == null) return false;
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return str.toLowerCase().includes(needle.toLowerCase());
}

function headerPresent(headers: unknown, name: string): boolean {
  if (!name) return true;
  if (!headers || typeof headers !== "object") return false;
  const lowerName = name.toLowerCase();
  return Object.keys(headers as Record<string, unknown>).some(
    (k) => k.toLowerCase() === lowerName,
  );
}

function matchesRule(rule: RoutingRule, msg: MessageRow): boolean {
  if (rule.match_from_contains && !jsonContains(msg.from_address, rule.match_from_contains))
    return false;
  if (
    rule.match_subject_contains &&
    !jsonContains(msg.subject ?? "", rule.match_subject_contains)
  )
    return false;
  if (rule.match_to_contains && !jsonContains(msg.to_addresses, rule.match_to_contains))
    return false;
  if (rule.match_has_header && !headerPresent(msg.raw_headers, rule.match_has_header))
    return false;
  if (rule.match_brand_id && msg.brand_id !== rule.match_brand_id) return false;
  return true;
}

export default function RuleTestDialog({ rule, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<MessageRow[]>([]);
  const [scanned, setScanned] = useState(0);

  useEffect(() => {
    if (!rule) {
      setMatches([]);
      setScanned(0);
      return;
    }
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select("id,from_address,from_name,subject,to_addresses,brand_id,raw_headers,received_at")
        .order("received_at", { ascending: false })
        .limit(50);
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      const rows = (data ?? []) as MessageRow[];
      setScanned(rows.length);
      setMatches(rows.filter((m) => matchesRule(rule, m)));
      setLoading(false);
    })();
  }, [rule]);

  return (
    <Dialog open={!!rule} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="surface-1 max-h-[80vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Test rule: {rule?.name}</DialogTitle>
          <DialogDescription>
            Dry-run against the last 50 inbound messages. Nothing is changed.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">Scanning…</div>
        ) : (
          <div className="space-y-2 overflow-y-auto">
            <div className="text-xs text-muted-foreground">
              Scanned {scanned} message{scanned === 1 ? "" : "s"} ·{" "}
              <Badge variant="secondary">{matches.length} match{matches.length === 1 ? "" : "es"}</Badge>
            </div>
            {matches.length === 0 ? (
              <div className="rounded-md border border-border surface-2 px-3 py-4 text-sm text-muted-foreground">
                No matches in the last 50 messages.
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border border-border">
                {matches.map((m) => (
                  <div
                    key={m.id}
                    className="border-b border-border px-3 py-2 text-sm last:border-b-0 surface-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 truncate font-medium">
                        {m.from_name || m.from_address}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(m.received_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {m.subject || "(no subject)"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
