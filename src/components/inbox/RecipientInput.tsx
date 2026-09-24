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
    // Onder md staat het label bóven het veld: naast elkaar liepen lange
    // adressen over het label heen op een telefoon.
    <div className="flex flex-col gap-1.5 border-b border-border px-page py-2.5 md:flex-row md:items-start md:gap-2 md:px-3 md:py-1.5">
      <span className="text-xs font-medium text-muted-foreground md:mt-1.5 md:w-12 md:flex-none">
        {label}
      </span>
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
            // text-base onder md: onder 16px zoomt iOS het scherm in bij focus.
            "min-w-[160px] flex-1 bg-transparent py-1 text-base placeholder:text-muted-foreground/60 focus:outline-none md:text-sm",
            error && "text-destructive",
          )}
        />
      </div>
    </div>
  );
}
