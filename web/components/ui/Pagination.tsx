"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  className?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const pages: number[] = [];
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  for (let index = Math.max(1, start); index <= end; index += 1) pages.push(index);

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex flex-col-reverse items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3 sm:flex-row",
        className
      )}
    >
      <p className="text-[12px] text-[var(--text-muted)]">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] bg-white px-2.5 text-[12.5px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Previous</span>
        </button>
        {pages.map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => onChange(entry)}
            aria-current={entry === page ? "page" : undefined}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-md text-[12.5px] font-medium transition-colors",
              entry === page
                ? "border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-hover)]"
                : "border border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
            )}
          >
            {entry}
          </button>
        ))}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] bg-white px-2.5 text-[12.5px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] disabled:pointer-events-none disabled:opacity-40"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </nav>
  );
}
