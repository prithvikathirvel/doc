import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { PermissionLevel } from "@/lib/types";
import { levelLabel, statusLabel } from "@/lib/utils";

const tones = {
  neutral: "bg-slate-50 text-[var(--text-secondary)] border-[var(--border)]",
  accent: "bg-[var(--accent-soft)] text-[var(--accent-hover)] border-[var(--accent-border)]",
  success: "bg-[var(--success-soft)] text-[var(--success)] border-[#abefc6]",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)] border-[#fedf89]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)] border-[#fecdca]",
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({
  children,
  tone = "neutral",
  dot,
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2 py-0.5 text-[11.5px] font-medium",
        tones[tone],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeTone> = {
    active: "success",
    pending_upload: "warning",
    soft_deleted: "neutral",
    failed: "danger",
    suspended: "danger",
  };
  return (
    <Badge tone={map[status] || "neutral"} dot>
      {statusLabel(status)}
    </Badge>
  );
}

export function LevelBadge({ level }: { level: PermissionLevel }) {
  const map: Record<PermissionLevel, BadgeTone> = {
    viewer: "neutral",
    contributor: "accent",
    manager: "warning",
    owner: "success",
  };
  return <Badge tone={map[level]}>{levelLabel(level)}</Badge>;
}
