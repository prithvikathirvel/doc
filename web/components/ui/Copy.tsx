"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Copying is not available in this browser");
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-[var(--text-muted)] transition-colors hover:border-[var(--border)] hover:bg-white hover:text-[var(--text)]",
        className
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-[var(--success)]" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/** Read-only value with a copy affordance — used for identifiers handed to customers. */
export function CopyRow({
  label,
  value,
  hint,
  mono = true,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1.5">
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[12.5px] text-[var(--text)]",
            mono && "font-mono text-[12px]"
          )}
          title={value}
        >
          {value}
        </span>
        <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
      </div>
      {hint && <p className="mt-1 text-[11.5px] text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}
