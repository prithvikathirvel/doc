import { cn } from "@/lib/utils";

const tones = {
  slate: "bg-slate-100 text-slate-600 border-slate-200",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
  amber: "bg-amber-50 text-amber-700 border-amber-100",
  red: "bg-red-50 text-red-700 border-red-100",
  blue: "bg-blue-50 text-blue-700 border-blue-100",
  violet: "bg-violet-50 text-violet-700 border-violet-100",
} as const;

export function Badge({
  children,
  tone = "slate",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, keyof typeof tones> = {
    active: "emerald",
    pending_upload: "amber",
    soft_deleted: "slate",
    failed: "red",
    suspended: "red",
  };
  const labels: Record<string, string> = {
    active: "Active",
    pending_upload: "Pending",
    soft_deleted: "Trash",
    failed: "Failed",
    suspended: "Suspended",
  };
  return <Badge tone={map[status] || "slate"}>{labels[status] || status}</Badge>;
}
