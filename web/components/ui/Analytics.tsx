"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { cn, formatDay, formatNumber } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon,
  href,
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  href?: string;
  loading?: boolean;
}) {
  const content = (
    <div
      className={cn(
        "flex h-full flex-col justify-between gap-3 rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-xs)] transition-colors",
        href && "hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium text-[var(--text-secondary)]">{label}</p>
        {icon && <span className="shrink-0 text-[var(--text-muted)]">{icon}</span>}
      </div>
      <div>
        {loading ? (
          <div className="skeleton h-7 w-16 rounded-md" />
        ) : (
          <p className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[var(--text)]">
            {value}
          </p>
        )}
        {hint && <p className="mt-1 text-[11.5px] text-[var(--text-muted)]">{hint}</p>}
      </div>
    </div>
  );

  if (!href) return content;
  return (
    <Link href={href} className="block h-full focus-visible:rounded-xl">
      {content}
    </Link>
  );
}

/**
 * Lightweight area chart rendered as inline SVG so the dashboard stays
 * dependency-free and prints correctly.
 */
export function TrendChart({
  points,
  height = 168,
  label = "Documents added",
}: {
  points: Array<{ date: string; documents: number }>;
  height?: number;
  label?: string;
}) {
  if (points.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-[12.5px] text-[var(--text-muted)]">
        No activity recorded yet
      </div>
    );
  }

  const width = 720;
  const paddingX = 8;
  const paddingY = 12;
  const max = Math.max(1, ...points.map((point) => point.documents));
  const stepX = (width - paddingX * 2) / Math.max(1, points.length - 1);
  const scaleY = (value: number) =>
    height - paddingY - (value / max) * (height - paddingY * 2);

  const coordinates = points.map((point, index) => ({
    x: paddingX + index * stepX,
    y: scaleY(point.documents),
    point,
  }));

  const line = coordinates
    .map((coordinate, index) => `${index === 0 ? "M" : "L"}${coordinate.x.toFixed(1)},${coordinate.y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${(width - paddingX).toFixed(1)},${height - paddingY} L${paddingX},${height - paddingY} Z`;
  const total = points.reduce((sum, point) => sum + point.documents, 0);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[12px] text-[var(--text-secondary)]">{label}</p>
        <p className="text-[12px] text-[var(--text-muted)]">
          {formatNumber(total)} in the last {points.length} days
        </p>
      </div>
      <div className="w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-40 w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${label}: ${total} over ${points.length} days`}
        >
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={ratio}
              x1={paddingX}
              x2={width - paddingX}
              y1={paddingY + ratio * (height - paddingY * 2)}
              y2={paddingY + ratio * (height - paddingY * 2)}
              stroke="var(--border)"
              strokeDasharray="4 6"
            />
          ))}
          <path d={area} fill="url(#trend-fill)" />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-[var(--text-muted)]">
        <span>{formatDay(points[0].date)}</span>
        <span>{formatDay(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}

export function BarList({
  items,
  emptyLabel = "No data yet",
}: {
  items: Array<{ label: string; value: number; caption?: string }>;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-[12.5px] text-[var(--text-muted)]">{emptyLabel}</p>;
  }
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[12.5px] text-[var(--text)]" title={item.label}>
              {item.label}
            </span>
            <span className="shrink-0 text-[12px] text-[var(--text-muted)]">
              {item.caption || formatNumber(item.value)}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[var(--accent)]/70"
              style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
