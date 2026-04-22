import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export interface BrandAccountOption {
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
  brandId: string | null;
  value: string | null;
  onChange: (accountId: string, account: BrandAccountOption) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Renders a dropdown of brand_accounts for the given brand.
 * Auto-selects the default account when brandId changes and no value is set.
 * Used in compose / draft UIs (Phase 4).
 */
export default function BrandAccountSelector({
  brandId,
  value,
  onChange,
  placeholder = "Select account",
  className,
}: Props) {
  const [accounts, setAccounts] = useState<BrandAccountOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!brandId) {
      setAccounts([]);
      return;
    }
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("brand_accounts")
        .select("*")
        .eq("brand_id", brandId)
        .order("sort_order", { ascending: true });
      const rows = (data ?? []) as BrandAccountOption[];
      setAccounts(rows);
      if (!value && rows.length > 0) {
        const def = rows.find((r) => r.is_default) ?? rows[0];
        onChange(def.id, def);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  const handleChange = (id: string) => {
    const acc = accounts.find((a) => a.id === id);
    if (acc) onChange(id, acc);
  };

  return (
    <Select value={value ?? undefined} onValueChange={handleChange} disabled={!brandId || loading}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={loading ? "Loading…" : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((acc) => {
          const initials = acc.display_name
            .split(/\s+/)
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          return (
            <SelectItem key={acc.id} value={acc.id}>
              <div className="flex items-center gap-2">
                <Avatar className="h-5 w-5">
                  {acc.avatar_url ? (
                    <AvatarImage src={acc.avatar_url} alt={acc.display_name} />
                  ) : null}
                  <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                </Avatar>
                <span>{acc.display_name}</span>
                {acc.role_title && (
                  <span className="text-xs text-muted-foreground">· {acc.role_title}</span>
                )}
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
