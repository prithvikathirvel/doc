"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronRight,
  Download,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  FolderPlus,
  Home,
  Pencil,
  RefreshCw,
  Search,
  Share2,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button, IconButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { Dialog } from "@/components/ui/Dialog";
import { UploadDialog } from "@/components/documents/UploadDialog";
import { AccessDialog } from "@/components/documents/AccessDialog";
import { DeleteFolderDialog } from "@/components/workspace/DeleteFolderDialog";
import { downloadDocument } from "@/lib/download";
import { documentsApi, foldersApi } from "@/lib/api";
import type { Document, Folder } from "@/lib/types";
import { cn, formatBytes, formatRelative } from "@/lib/utils";

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

/**
 * One browser for folders and documents: folders and files live in the same list,
 * navigation is by breadcrumb, and the current folder is kept in the URL so a view
 * can be shared or refreshed.
 */
export function FilesView({
  tenantId,
  basePath,
  maxFileSizeBytes,
}: {
  tenantId: string;
  basePath: string;
  maxFileSizeBytes?: number;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const folderId = search.get("folder");

  const [loading, setLoading] = useState(true);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [allFolders, setAllFolders] = useState<Folder[]>([]);
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null);
  const [term, setTerm] = useState("");
  const [appliedTerm, setAppliedTerm] = useState("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [folderDialog, setFolderDialog] = useState<{ mode: "create" | "rename"; folder?: Folder } | null>(
    null
  );
  const [folderName, setFolderName] = useState("");
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<Folder | null>(null);
  const [renameDocument, setRenameDocument] = useState<Document | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [trashTarget, setTrashTarget] = useState<Document | null>(null);
  const [shareTarget, setShareTarget] = useState<Document | null>(null);
  const [busy, setBusy] = useState(false);

  const navigate = useCallback(
    (nextFolderId: string | null) => {
      const query = nextFolderId ? `?folder=${encodeURIComponent(nextFolderId)}` : "";
      router.push(`${basePath}/documents${query}`);
    },
    [basePath, router]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const searching = Boolean(appliedTerm);
      const [folderResult, documentResult, allFolderResult] = await Promise.all([
        searching
          ? Promise.resolve({ folders: [] as Folder[] })
          : foldersApi.list(tenantId, folderId ?? null),
        documentsApi.list(tenantId, {
          folderId: searching ? undefined : (folderId ?? null),
          q: appliedTerm || undefined,
          limit: 200,
        }),
        foldersApi.list(tenantId),
      ]);

      setFolders(folderResult.folders || []);
      setDocuments(documentResult.documents.filter((item) => item.status !== "soft_deleted"));
      setAllFolders(allFolderResult.folders || []);
      setCurrentFolder(
        folderId ? (allFolderResult.folders || []).find((entry) => entry.id === folderId) || null : null
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load this folder");
      setFolders([]);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, folderId, appliedTerm]);

  useEffect(() => {
    void load();
  }, [load]);

  // Breadcrumb is derived from the folder path so deep links resolve without extra calls.
  const breadcrumb = useMemo(() => {
    if (!currentFolder) return [] as Folder[];
    const segments = currentFolder.path.split("/").filter(Boolean);
    const trail: Folder[] = [];
    let prefix = "";
    for (const segment of segments) {
      prefix = `${prefix}/${segment}`;
      const match = allFolders.find((entry) => entry.path === prefix);
      if (match) trail.push(match);
    }
    return trail.length ? trail : [currentFolder];
  }, [currentFolder, allFolders]);

  const submitFolder = async () => {
    const name = folderName.trim();
    if (!name || !folderDialog) return;
    setBusy(true);
    try {
      if (folderDialog.mode === "create") {
        await foldersApi.create(tenantId, { name, parentId: folderId ?? null });
        toast.success("Folder created");
      } else if (folderDialog.folder) {
        await foldersApi.rename(tenantId, folderDialog.folder.id, name);
        toast.success("Folder renamed");
      }
      setFolderDialog(null);
      setFolderName("");
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The folder could not be saved");
    } finally {
      setBusy(false);
    }
  };

  const submitDocumentRename = async () => {
    if (!renameDocument || !documentName.trim()) return;
    setBusy(true);
    try {
      await documentsApi.rename(tenantId, renameDocument.id, { name: documentName.trim() });
      toast.success("Document renamed");
      setRenameDocument(null);
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  };

  const submitTrash = async () => {
    if (!trashTarget) return;
    setBusy(true);
    try {
      await documentsApi.moveToTrash(tenantId, trashTarget.id);
      toast.success("Moved to trash");
      setTrashTarget(null);
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not move to trash");
    } finally {
      setBusy(false);
    }
  };

  const isEmpty = folders.length === 0 && documents.length === 0;

  return (
    <div className="space-y-4 animate-rise">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-0.5 text-[12.5px]">
          <button
            type="button"
            onClick={() => navigate(null)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors hover:bg-[var(--surface-muted)]",
              currentFolder ? "text-[var(--text-secondary)]" : "text-[var(--text)]"
            )}
          >
            <Home className="h-3.5 w-3.5" />
            All files
          </button>
          {breadcrumb.map((entry, index) => (
            <span key={entry.id} className="flex min-w-0 items-center">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
              <button
                type="button"
                onClick={() => navigate(entry.id)}
                className={cn(
                  "max-w-[180px] truncate rounded-md px-2 py-1 font-medium transition-colors hover:bg-[var(--surface-muted)]",
                  index === breadcrumb.length - 1 ? "text-[var(--text)]" : "text-[var(--text-secondary)]"
                )}
              >
                {entry.name}
              </button>
            </span>
          ))}
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <form
            className="w-full sm:w-56"
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedTerm(term.trim());
            }}
          >
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search all documents"
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search documents"
            />
          </form>
          <Button variant="secondary" onClick={() => void load()} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setFolderName("");
              setFolderDialog({ mode: "create" });
            }}
            leftIcon={<FolderPlus className="h-3.5 w-3.5" />}
          >
            New folder
          </Button>
          <Button onClick={() => setUploadOpen(true)} leftIcon={<Upload className="h-3.5 w-3.5" />}>
            Upload
          </Button>
        </div>
      </div>

      {appliedTerm && (
        <div className="flex items-center gap-2 text-[12.5px] text-[var(--text-secondary)]">
          <Badge tone="accent">Search</Badge>
          Showing documents matching “{appliedTerm}” across every folder.
          <button
            type="button"
            onClick={() => {
              setTerm("");
              setAppliedTerm("");
            }}
            className="font-medium text-[var(--accent)] hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      <Card padded={false}>
        {loading ? (
          <LoadingBlock label="Loading files" />
        ) : isEmpty ? (
          <EmptyState
            icon={<FolderOpen className="h-4 w-4" />}
            title={appliedTerm ? "No matching documents" : "This folder is empty"}
            description={
              appliedTerm
                ? "Try a different search term."
                : "Upload a document or create a folder to organise this workspace."
            }
            action={
              appliedTerm ? undefined : (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => {
                    setFolderName("");
                    setFolderDialog({ mode: "create" });
                  }}>
                    New folder
                  </Button>
                  <Button size="sm" onClick={() => setUploadOpen(true)}>
                    Upload document
                  </Button>
                </div>
              )
            }
          />
        ) : (
          <>
            {/* Wide screens: one table for folders and documents */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[680px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]">
                    {["Name", "Type", "Size", "Modified", ""].map((heading, index) => (
                      <th
                        key={heading || index}
                        scope="col"
                        className={cn(
                          "px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]",
                          index === 4 && "text-right"
                        )}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {folders.map((folder) => (
                    <tr key={folder.id} className="transition-colors hover:bg-[var(--surface-muted)]">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => navigate(folder.id)}
                          className="group flex items-center gap-3 text-left"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]">
                            <FolderOpen className="h-4 w-4" strokeWidth={1.75} />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium text-[var(--text)] group-hover:text-[var(--accent-hover)]">
                              {folder.name}
                            </span>
                            <span className="block truncate text-[11.5px] text-[var(--text-muted)]">
                              {folder.path}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-[12.5px] text-[var(--text-secondary)]">Folder</td>
                      <td className="px-4 py-3 text-[12.5px] text-[var(--text-muted)]">—</td>
                      <td className="whitespace-nowrap px-4 py-3 text-[12.5px] text-[var(--text-muted)]">
                        {formatRelative(folder.updatedAt)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <IconButton
                            label="Rename folder"
                            onClick={() => {
                              setFolderName(folder.name);
                              setFolderDialog({ mode: "rename", folder });
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton
                            label="Delete folder"
                            tone="danger"
                            onClick={() => setDeleteFolderTarget(folder)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {documents.map((document) => (
                    <tr key={document.id} className="transition-colors hover:bg-[var(--surface-muted)]">
                      <td className="max-w-[320px] px-4 py-3">
                        <Link
                          href={`${basePath}/documents/${document.id}`}
                          className="group flex items-center gap-3"
                        >
                          <FileIcon mimeType={document.mimeType} />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium text-[var(--text)] group-hover:text-[var(--accent-hover)]">
                              {document.name}
                            </span>
                            <span className="block truncate text-[11.5px] text-[var(--text-muted)]">
                              {document.originalFilename} · v{document.currentVersion}
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
                      <td className="whitespace-nowrap px-4 py-3 text-[12.5px] text-[var(--text-muted)]">
                        {formatRelative(document.updatedAt)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <IconButton
                            label="Download"
                            onClick={() => {
                              void downloadDocument(tenantId, document).catch((error) =>
                                toast.error(error instanceof Error ? error.message : "Download failed")
                              );
                            }}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton label="Manage access" onClick={() => setShareTarget(document)}>
                            <Share2 className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton
                            label="Rename document"
                            onClick={() => {
                              setDocumentName(document.name);
                              setRenameDocument(document);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton
                            label="Move to trash"
                            tone="danger"
                            onClick={() => setTrashTarget(document)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Small screens: the same list as cards */}
            <ul className="divide-y divide-[var(--border)] md:hidden">
              {folders.map((folder) => (
                <li key={folder.id} className="flex items-center gap-3 p-3.5">
                  <button
                    type="button"
                    onClick={() => navigate(folder.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]">
                      <FolderOpen className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-[var(--text)]">
                        {folder.name}
                      </span>
                      <span className="block text-[11.5px] text-[var(--text-muted)]">
                        Folder · {formatRelative(folder.updatedAt)}
                      </span>
                    </span>
                  </button>
                  <IconButton label="Delete folder" tone="danger" onClick={() => setDeleteFolderTarget(folder)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </li>
              ))}
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
                        <div className="flex items-center gap-0.5">
                          <IconButton
                            label="Download"
                            onClick={() => {
                              void downloadDocument(tenantId, document).catch((error) =>
                                toast.error(error instanceof Error ? error.message : "Download failed")
                              );
                            }}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton label="Manage access" onClick={() => setShareTarget(document)}>
                            <Share2 className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton label="Move to trash" tone="danger" onClick={() => setTrashTarget(document)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconButton>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => void load()}
        tenantId={tenantId}
        folders={allFolders}
        defaultFolderId={folderId}
        maxFileSizeBytes={maxFileSizeBytes}
      />

      <AccessDialog
        open={Boolean(shareTarget)}
        onClose={() => setShareTarget(null)}
        tenantId={tenantId}
        document={shareTarget}
      />

      <DeleteFolderDialog
        tenantId={tenantId}
        folder={deleteFolderTarget}
        onClose={() => setDeleteFolderTarget(null)}
        onDeleted={() => {
          if (deleteFolderTarget && deleteFolderTarget.id === folderId) {
            navigate(currentFolder?.parentId ?? null);
          } else {
            void load();
          }
        }}
      />

      <Dialog
        open={Boolean(folderDialog)}
        onClose={() => setFolderDialog(null)}
        title={folderDialog?.mode === "rename" ? "Rename folder" : "New folder"}
        description={
          folderDialog?.mode === "rename"
            ? undefined
            : currentFolder
              ? `Created inside “${currentFolder.name}”`
              : "Created at the root of this workspace"
        }
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setFolderDialog(null)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={() => void submitFolder()}>
              {folderDialog?.mode === "rename" ? "Save" : "Create folder"}
            </Button>
          </>
        }
      >
        <Input
          label="Folder name"
          value={folderName}
          onChange={(event) => setFolderName(event.target.value)}
          placeholder="Contracts"
          autoFocus
          required
        />
      </Dialog>

      <Dialog
        open={Boolean(renameDocument)}
        onClose={() => setRenameDocument(null)}
        title="Rename document"
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setRenameDocument(null)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={() => void submitDocumentRename()}>
              Save
            </Button>
          </>
        }
      >
        <Input
          label="Display name"
          value={documentName}
          onChange={(event) => setDocumentName(event.target.value)}
          autoFocus
        />
      </Dialog>

      <Dialog
        open={Boolean(trashTarget)}
        onClose={() => setTrashTarget(null)}
        title="Move to trash"
        description={trashTarget ? `“${trashTarget.name}” can be restored from trash later.` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setTrashTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={busy} onClick={() => void submitTrash()}>
              Move to trash
            </Button>
          </>
        }
      />
    </div>
  );
}
