import type { ProviderType } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Provider marks drawn inline: no external assets, no licensing of vendor logo files,
 * and a new provider only needs one entry here plus its spec in lib/utils.
 */
const MARKS: Record<ProviderType, { label: string; short: string; color: string; background: string }> = {
  s3: { label: "Amazon S3", short: "S3", color: "#c2560f", background: "#fff4ec" },
  minio: { label: "MinIO", short: "MIN", color: "#a01a25", background: "#fef3f2" },
  gcp: { label: "Google Cloud Storage", short: "GCS", color: "#1a63c9", background: "#eef4ff" },
  azure: { label: "Azure Blob Storage", short: "AZ", color: "#0a5aa8", background: "#eef6ff" },
};

const sizes = {
  sm: "h-7 w-7 text-[9px] rounded-md",
  md: "h-9 w-9 text-[10px] rounded-lg",
  lg: "h-11 w-11 text-[11px] rounded-xl",
};

export function ProviderMark({
  provider,
  size = "md",
  className,
}: {
  provider: ProviderType | string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const mark = MARKS[provider as ProviderType];
  if (!mark) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center border border-[var(--border)] bg-[var(--surface-muted)] font-semibold uppercase text-[var(--text-muted)]",
          sizes[size],
          className
        )}
      >
        {String(provider).slice(0, 3)}
      </span>
    );
  }

  return (
    <span
      aria-label={mark.label}
      title={mark.label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center border font-semibold uppercase tracking-wide",
        sizes[size],
        className
      )}
      style={{ color: mark.color, backgroundColor: mark.background, borderColor: `${mark.color}22` }}
    >
      {mark.short}
    </span>
  );
}
