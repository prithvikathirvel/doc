"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadingBlock } from "./Feedback";

export interface Column<T> {
  /** Stable key, also used as the sort key. */
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Value used for client-side sorting. Omit to make the column unsortable. */
  sortValue?: (row: T) => string | number | null | undefined;
  align?: "left" | "right";
  /** Hides the column below this breakpoint so narrow screens stay readable. */
  hideBelow?: "sm" | "md" | "lg" | "xl";
  width?: string;
  className?: string;
}

type SortState = { key: string; direction: "asc" | "desc" } | null;

const hideClasses: Record<NonNullable<Column<unknown>["hideBelow"]>, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

/**
 * The single table used across the product.
 *
 * Sorting and pagination are independent switches: turn either off and the table
 * simply renders the rows it is given, so the same component fits a five-row summary
 * and a long directory.
 */
export function DataTable<T>({
  data,
  columns,
  getRowId,
  onRowClick,
  sortable = true,
  defaultSort,
  pagination = true,
  pageSize: initialPageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  loading,
  loadingLabel = "Loading",
  empty,
  toolbar,
  caption,
  dense,
  className,
}: {
  data: T[];
  columns: Array<Column<T>>;
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  sortable?: boolean;
  defaultSort?: { key: string; direction?: "asc" | "desc" };
  pagination?: boolean;
  pageSize?: number;
  pageSizeOptions?: number[];
  loading?: boolean;
  loadingLabel?: string;
  empty?: ReactNode;
  toolbar?: ReactNode;
  caption?: string;
  dense?: boolean;
  className?: string;
}) {
  const [sort, setSort] = useState<SortState>(
    defaultSort ? { key: defaultSort.key, direction: defaultSort.direction || "asc" } : null
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  useEffect(() => {
    setPage(1);
  }, [data.length, sort, pageSize]);

  const sorted = useMemo(() => {
    if (!sortable || !sort) return data;
    const column = columns.find((entry) => entry.key === sort.key);
    if (!column?.sortValue) return data;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...data].sort((a, b) => {
      const left = column.sortValue?.(a);
      const right = column.sortValue?.(b);
      if (left == null && right == null) return 0;
      if (left == null) return 1;
      if (right == null) return -1;
      if (typeof left === "number" && typeof right === "number") return (left - right) * factor;
      return String(left).localeCompare(String(right), undefined, { numeric: true }) * factor;
    });
  }, [data, columns, sort, sortable]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rows = pagination
    ? sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : sorted;

  const toggleSort = (column: Column<T>) => {
    if (!sortable || !column.sortValue) return;
    setSort((current) => {
      if (!current || current.key !== column.key) return { key: column.key, direction: "asc" };
      if (current.direction === "asc") return { key: column.key, direction: "desc" };
      return null;
    });
  };

  const pageNumbers: number[] = [];
  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  for (let index = start; index <= Math.min(totalPages, start + 4); index += 1) pageNumbers.push(index);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-[var(--shadow-xs)]",
        className
      )}
    >
      {toolbar && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          {toolbar}
        </div>
      )}

      {loading ? (
        <LoadingBlock label={loadingLabel} />
      ) : total === 0 ? (
        empty
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              {caption && <caption className="sr-only">{caption}</caption>}
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]">
                  {columns.map((column) => {
                    const active = sort?.key === column.key;
                    const canSort = sortable && Boolean(column.sortValue);
                    return (
                      <th
                        key={column.key}
                        scope="col"
                        style={column.width ? { width: column.width } : undefined}
                        aria-sort={
                          active ? (sort?.direction === "asc" ? "ascending" : "descending") : "none"
                        }
                        className={cn(
                          "whitespace-nowrap px-4 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]",
                          dense ? "py-2" : "py-2.5",
                          column.align === "right" && "text-right",
                          column.hideBelow && hideClasses[column.hideBelow]
                        )}
                      >
                        {canSort ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(column)}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded transition-colors hover:text-[var(--text-secondary)]",
                              active && "text-[var(--text)]",
                              column.align === "right" && "flex-row-reverse"
                            )}
                          >
                            {column.header}
                            {active ? (
                              sort?.direction === "asc" ? (
                                <ArrowUp className="h-3 w-3" />
                              ) : (
                                <ArrowDown className="h-3 w-3" />
                              )
                            ) : (
                              <ChevronsUpDown className="h-3 w-3 opacity-40" />
                            )}
                          </button>
                        ) : (
                          column.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map((row) => (
                  <tr
                    key={getRowId(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "transition-colors",
                      onRowClick && "cursor-pointer",
                      "hover:bg-[var(--surface-muted)]"
                    )}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn(
                          "px-4 align-middle text-[13px] text-[var(--text)]",
                          dense ? "py-2" : "py-3",
                          column.align === "right" && "text-right",
                          column.hideBelow && hideClasses[column.hideBelow],
                          column.className
                        )}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && (
            <div className="flex flex-col-reverse items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-2.5 sm:flex-row">
              <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
                <span>
                  {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, total)} of {total}
                </span>
                {pageSizeOptions.length > 1 && (
                  <>
                    <span className="text-[var(--border-strong)]">·</span>
                    <label className="flex items-center gap-1.5">
                      <span className="sr-only sm:not-sr-only">Rows</span>
                      <select
                        value={pageSize}
                        onChange={(event) => setPageSize(Number(event.target.value))}
                        className="h-7 rounded-md border border-[var(--border)] bg-white px-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:outline-none"
                      >
                        {pageSizeOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
              </div>

              {totalPages > 1 && (
                <nav aria-label="Pagination" className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage(currentPage - 1)}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--border)] bg-white px-2 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] disabled:pointer-events-none disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Previous</span>
                  </button>
                  {pageNumbers.map((number) => (
                    <button
                      key={number}
                      type="button"
                      onClick={() => setPage(number)}
                      aria-current={number === currentPage ? "page" : undefined}
                      className={cn(
                        "inline-flex h-7 w-7 items-center justify-center rounded-md text-[12px] font-medium transition-colors",
                        number === currentPage
                          ? "border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-hover)]"
                          : "border border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
                      )}
                    >
                      {number}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage(currentPage + 1)}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--border)] bg-white px-2 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] disabled:pointer-events-none disabled:opacity-40"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </nav>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
