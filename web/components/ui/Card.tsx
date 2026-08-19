import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-[var(--border)] bg-white shadow-[var(--shadow-xs)]",
        padded && "p-4 sm:p-5",
        className
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-4 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text)]">{title}</h2>
        {description && (
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{description}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}

export function DescriptionList({
  items,
  columns = 2,
  className,
}: {
  items: Array<{ label: string; value: ReactNode; mono?: boolean; full?: boolean }>;
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  const columnClass =
    columns === 1 ? "sm:grid-cols-1" : columns === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2";
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-4", columnClass, className)}>
      {items.map((item) => (
        <div key={item.label} className={cn("min-w-0", item.full && "sm:col-span-full")}>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            {item.label}
          </dt>
          <dd
            className={cn(
              "mt-1 break-words text-[13px] text-[var(--text)]",
              item.mono && "font-mono text-[12.5px]"
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
