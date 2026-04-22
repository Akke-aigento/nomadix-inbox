import { useState, KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RecipientInput({ label, values, onChange, placeholder }: Props) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(false);

  const commit = (raw: string) => {
    const v = raw.trim().replace(/[,;]+$/, "");
    if (!v) return;
    if (!EMAIL_RE.test(v)) {
      setError(true);
      return;
    }
    if (values.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
    setError(false);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === ";" || e.key === "Tab") {
      if (draft.trim()) {
        e.preventDefault();
        commit(draft);
      }
    } else if (e.key === "Backspace" && !draft && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className="flex items-start gap-2 border-b border-border px-3 py-1.5">
      <span className="mt-1.5 w-12 flex-none text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-1 flex-wrap items-center gap-1">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(false);
          }}
          onKeyDown={onKey}
          onBlur={() => draft.trim() && commit(draft)}
          placeholder={values.length === 0 ? placeholder : ""}
          className={cn(
            "min-w-[160px] flex-1 bg-transparent py-1 text-sm placeholder:text-muted-foreground/60 focus:outline-none",
            error && "text-destructive",
          )}
        />
      </div>
    </div>
  );
}
