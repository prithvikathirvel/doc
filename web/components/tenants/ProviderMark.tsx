"use client";

import { useState } from "react";
import type { ProviderType } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Official-ish provider marks from a public icon CDN. If an asset cannot load
 * (offline, blocked network, etc.), the component falls back to a clean monogram
 * so the UI never breaks.
 */
const MARKS: Record<
  ProviderType,
  { label: string; short: string; color: string; background: string; logo: string }
> = {
  s3: {
    label: "Amazon S3",
    short: "S3",
    color: "#232f3e",
    background: "#fff7e6",
    logo: "https://cdn.simpleicons.org/amazonaws/FF9900",
  },
  minio: {
    label: "MinIO",
    short: "MIN",
    color: "#c72e49",
    background: "#fff1f3",
    logo: "https://cdn.simpleicons.org/minio/C72E49",
  },
  gcp: {
    label: "Google Cloud Storage",
    short: "GCS",
    color: "#1a73e8",
    background: "#eaf2ff",
    logo: "https://cdn.simpleicons.org/googlecloud/4285F4",
  },
  azure: {
    label: "Azure Blob Storage",
    short: "AZ",
    color: "#0078d4",
    background: "#eaf4ff",
    logo: "https://cdn.simpleicons.org/microsoftazure/0078D4",
  },
};

const sizes = {
  sm: "h-7 w-7",
  md: "h-9 w-9",
  lg: "h-11 w-11",
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
          "inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[10px] font-semibold uppercase text-[var(--text-muted)]",
          sizes[size],
          className
        )}
      >
        {String(provider).slice(0, 3)}
      </span>
    );
  }

  return <OfficialMark mark={mark} size={size} className={className} />;
}

function OfficialMark({
  mark,
  size,
  className,
}: {
  mark: (typeof MARKS)[ProviderType];
  size: keyof typeof sizes;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <span
      aria-label={mark.label}
      title={mark.label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border font-semibold uppercase tracking-wide",
        sizes[size],
        className
      )}
      style={{ color: mark.color, backgroundColor: mark.background, borderColor: `${mark.color}22` }}
    >
      {failed ? (
        <span className="text-[10px]">{mark.short}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mark.logo}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-[58%] w-[58%] object-contain"
        />
      )}
    </span>
  );
}
