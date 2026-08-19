"use client";

import Link from "next/link";
import {
  Download,
  FileText,
  FileImage,
  File,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Share2,
  Trash2,
} from "lucide-react";
import type { Document } from "@/lib/types";
import { formatBytes, formatRelative, mimeIconKind, cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

function DocIcon({ mime }: { mime: string }) {
  const kind = mimeIconKind(mime);
  const Icon = kind === "image" ? FileImage : kind === "pdf" || kind === "text" ? FileText : File;
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </div>
  );
}

export function DocumentTable({
  documents,
  onDownload,
  onRename,
  onDelete,
  onRestore,
  onShare,
  showRestore,
}: {
  documents: Document[];
  onDownload?: (doc: Document) => void;
  onRename?: (doc: Document) => void;
  onDelete?: (doc: Document) => void;
  onRestore?: (doc: Document) => void;
  onShare?: (doc: Document) => void;
  showRestore?: boolean;
}) {
  if (documents.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-4 w-4" />}
        title="No documents"
        description="Upload a file or adjust your filters."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="border-b border-slate-200/80 bg-slate-50/90">
              {["Name", "Status", "Size", "Version", "Updated", ""].map((h) => (
                <th
                  key={h || "actions"}
                  className="px-6 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {documents.map((doc) => (
              <tr key={doc.id} className="transition-colors hover:bg-slate-50/70">
                <td className="px-6 py-4">
                  <Link href={`/documents/${doc.id}`} className="flex items-center gap-3 group">
                    <DocIcon mime={doc.mimeType} />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-slate-800 group-hover:text-indigo-700">
                        {doc.name}
                      </p>
                      <p className="truncate text-[11px] text-slate-400">{doc.originalFilename}</p>
                    </div>
                  </Link>
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={doc.status} />
                </td>
                <td className="px-6 py-4 text-[13px] text-slate-700">{formatBytes(doc.size)}</td>
                <td className="px-6 py-4 text-[13px] text-slate-700">v{doc.currentVersion}</td>
                <td className="px-6 py-4 text-[13px] text-slate-500">{formatRelative(doc.updatedAt)}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-0.5">
                    {onDownload && doc.status === "active" && (
                      <IconBtn title="Download" onClick={() => onDownload(doc)}>
                        <Download className="h-3.5 w-3.5" />
                      </IconBtn>
                    )}
                    {onShare && doc.status !== "soft_deleted" && (
                      <IconBtn title="Share" onClick={() => onShare(doc)}>
                        <Share2 className="h-3.5 w-3.5" />
                      </IconBtn>
                    )}
                    {onRename && doc.status !== "soft_deleted" && (
                      <IconBtn title="Rename" onClick={() => onRename(doc)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </IconBtn>
                    )}
                    {showRestore && onRestore && (
                      <IconBtn title="Restore" onClick={() => onRestore(doc)}>
                        <RotateCcw className="h-3.5 w-3.5" />
                      </IconBtn>
                    )}
                    {onDelete && (
                      <IconBtn title="Delete" tone="error" onClick={() => onDelete(doc)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconBtn>
                    )}
                    <Link
                      href={`/documents/${doc.id}`}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                      title="Open"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  tone = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  tone?: "default" | "error";
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-lg p-1.5 text-slate-500 transition-colors",
        tone === "error" ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-blue-50 hover:text-blue-600"
      )}
    >
      {children}
    </button>
  );
}
