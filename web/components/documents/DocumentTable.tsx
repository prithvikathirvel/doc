"use client";

import Link from "next/link";
import {
  Download,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Pencil,
  RotateCcw,
  Share2,
  Trash2,
} from "lucide-react";
import type { Document } from "@/lib/types";
import { cn, formatBytes, formatRelative } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/Button";

export interface DocumentActions {
  onDownload?: (document: Document) => void;
  onRename?: (document: Document) => void;
  onShare?: (document: Document) => void;
  onTrash?: (document: Document) => void;
  onRestore?: (document: Document) => void;
  onDeleteForever?: (document: Document) => void;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  const Icon = mimeType?.startsWith("image/")
    ? FileImage
    : mimeType?.includes("sheet") || mimeType?.includes("csv")
      ? FileSpreadsheet
      : mimeType?.includes("pdf") || mimeType?.startsWith("text/")
        ? FileText
        : File;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-muted)]">
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </span>
  );
}

function RowActions({ document, actions }: { document: Document; actions: DocumentActions }) {
  const trashed = document.status === "soft_deleted";
  return (
    <div className="flex items-center justify-end gap-0.5">
      {actions.onDownload && document.status === "active" && (
        <IconButton label="Download" onClick={() => actions.onDownload?.(document)}>
          <Download className="h-3.5 w-3.5" />
        </IconButton>
      )}
      {actions.onShare && !trashed && (
        <IconButton label="Manage access" onClick={() => actions.onShare?.(document)}>
          <Share2 className="h-3.5 w-3.5" />
        </IconButton>
      )}
      {actions.onRename && !trashed && (
        <IconButton label="Rename" onClick={() => actions.onRename?.(document)}>
          <Pencil className="h-3.5 w-3.5" />
        </IconButton>
      )}
      {actions.onRestore && trashed && (
        <IconButton label="Restore" onClick={() => actions.onRestore?.(document)}>
          <RotateCcw className="h-3.5 w-3.5" />
        </IconButton>
      )}
      {actions.onTrash && !trashed && (
        <IconButton label="Move to trash" tone="danger" onClick={() => actions.onTrash?.(document)}>
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      )}
      {actions.onDeleteForever && trashed && (
        <IconButton
          label="Delete permanently"
          tone="danger"
          onClick={() => actions.onDeleteForever?.(document)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      )}
    </div>
  );
}

export function DocumentTable({
  documents,
  basePath,
  actions = {},
  className,
}: {
  documents: Document[];
  basePath: string;
  actions?: DocumentActions;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden", className)}>
      {/* Table for wide screens */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]">
              {["Name", "Status", "Size", "Version", "Updated", ""].map((heading, index) => (
                <th
                  key={heading || index}
                  scope="col"
                  className={cn(
                    "px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]",
                    index === 5 && "text-right"
                  )}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {documents.map((document) => (
              <tr key={document.id} className="transition-colors hover:bg-[var(--surface-muted)]">
                <td className="max-w-[320px] px-4 py-3">
                  <Link href={`${basePath}/documents/${document.id}`} className="group flex items-center gap-3">
                    <FileIcon mimeType={document.mimeType} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-[var(--text)] group-hover:text-[var(--accent-hover)]">
                        {document.name}
                      </span>
                      <span className="block truncate text-[11.5px] text-[var(--text-muted)]">
                        {document.originalFilename}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={document.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-[12.5px] text-[var(--text-secondary)]">
                  {formatBytes(document.size)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-[12.5px] text-[var(--text-secondary)]">
                  v{document.currentVersion}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-[12.5px] text-[var(--text-muted)]">
                  {formatRelative(document.updatedAt)}
                </td>
                <td className="px-3 py-3">
                  <RowActions document={document} actions={actions} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Card list for small screens */}
      <ul className="divide-y divide-[var(--border)] md:hidden">
        {documents.map((document) => (
          <li key={document.id} className="p-3.5">
            <div className="flex items-start gap-3">
              <FileIcon mimeType={document.mimeType} />
              <div className="min-w-0 flex-1">
                <Link
                  href={`${basePath}/documents/${document.id}`}
                  className="block truncate text-[13px] font-medium text-[var(--text)]"
                >
                  {document.name}
                </Link>
                <p className="mt-0.5 truncate text-[11.5px] text-[var(--text-muted)]">
                  {formatBytes(document.size)} · v{document.currentVersion} ·{" "}
                  {formatRelative(document.updatedAt)}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <StatusBadge status={document.status} />
                  <RowActions document={document} actions={actions} />
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
