"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, FolderOpen, RefreshCw, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog, Dialog } from "@/components/ui/Dialog";
import { DocumentTable } from "@/components/documents/DocumentTable";
import { UploadDialog } from "@/components/documents/UploadDialog";
import { AccessDialog } from "@/components/documents/AccessDialog";
import { documentsApi, foldersApi, pickSignedUrl, sessionHeaders } from "@/lib/api";
import type { Document, Folder } from "@/lib/types";

const PAGE_SIZE = 10;

export async function downloadDocument(tenantId: string, document: Document, versionNumber?: number) {
  const result = await documentsApi.download(tenantId, document.id, versionNumber);
  const signed = pickSignedUrl(result);
  if (signed?.url) {
    window.open(signed.url, "_blank", "noopener,noreferrer");
    return;
  }
  const response = await fetch(documentsApi.contentUrl(document.id, versionNumber), {
    headers: sessionHeaders(tenantId),
  });
  if (!response.ok) throw new Error("The file could not be downloaded");
  const blob = await response.blob();
  const anchor = window.document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = document.originalFilename || document.name;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

export function DocumentsView({
  tenantId,
  basePath,
  maxFileSizeBytes,
  canUpload = true,
}: {
  tenantId: string;
  basePath: string;
  maxFileSizeBytes?: number;
  canUpload?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [total, setTotal] = useState(0);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Document | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [trashTarget, setTrashTarget] = useState<Document | null>(null);
  const [shareTarget, setShareTarget] = useState<Document | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [documentResult, folderResult] = await Promise.all([
        documentsApi.list(tenantId, {
          q: appliedSearch || undefined,
          folderId: folderFilter === "" ? undefined : folderFilter === "root" ? null : folderFilter,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        }),
        foldersApi.list(tenantId),
      ]);
      setDocuments(documentResult.documents.filter((item) => item.status !== "soft_deleted"));
      setTotal(documentResult.total);
      setFolders(folderResult.folders || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load documents");
      setDocuments([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [tenantId, appliedSearch, folderFilter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const folderOptions = useMemo(
    () => [
      { value: "", label: "All folders" },
      { value: "root", label: "Root only" },
      ...folders.map((folder) => ({ value: folder.id, label: folder.path || folder.name })),
    ],
    [folders]
  );

  const submitRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    setBusy(true);
    try {
      await documentsApi.rename(tenantId, renameTarget.id, { name: renameValue.trim() });
      toast.success("Document renamed");
      setRenameTarget(null);
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

  return (
    <div className="space-y-4 animate-rise">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form
          className="flex w-full flex-col gap-2 sm:flex-row sm:items-center"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setAppliedSearch(search.trim());
          }}
        >
          <div className="w-full sm:max-w-xs">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search documents"
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search documents"
            />
          </div>
          <div className="w-full sm:w-56">
            <Select
              value={folderFilter}
              onChange={(event) => {
                setPage(1);
                setFolderFilter(event.target.value);
              }}
              options={folderOptions}
              aria-label="Filter by folder"
            />
          </div>
        </form>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            size="md"
            onClick={() => void load()}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Refresh
          </Button>
          {canUpload && (
            <Button size="md" onClick={() => setUploadOpen(true)} leftIcon={<Upload className="h-3.5 w-3.5" />}>
              Upload
            </Button>
          )}
        </div>
      </div>

      <Card padded={false}>
        {loading ? (
          <LoadingBlock label="Loading documents" />
        ) : documents.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-4 w-4" />}
            title={appliedSearch ? "No matching documents" : "No documents yet"}
            description={
              appliedSearch
                ? "Try a different search term or clear the folder filter."
                : "Upload the first document to this workspace."
            }
            action={
              canUpload && !appliedSearch ? (
                <Button size="sm" onClick={() => setUploadOpen(true)}>
                  Upload document
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <DocumentTable
              documents={documents}
              basePath={basePath}
              actions={{
                onDownload: (document) => {
                  void downloadDocument(tenantId, document).catch((error) =>
                    toast.error(error instanceof Error ? error.message : "Download failed")
                  );
                },
                onShare: (document) => setShareTarget(document),
                onRename: (document) => {
                  setRenameTarget(document);
                  setRenameValue(document.name);
                },
                onTrash: (document) => setTrashTarget(document),
              }}
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
          </>
        )}
      </Card>

      {folders.length === 0 && !loading && (
        <p className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
          <FolderOpen className="h-3.5 w-3.5" />
          Create folders to organise documents by team, client or year.
        </p>
      )}

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => void load()}
        tenantId={tenantId}
        folders={folders}
        maxFileSizeBytes={maxFileSizeBytes}
      />

      <AccessDialog
        open={Boolean(shareTarget)}
        onClose={() => setShareTarget(null)}
        tenantId={tenantId}
        document={shareTarget}
      />

      <Dialog
        open={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        title="Rename document"
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={() => void submitRename()}>
              Save
            </Button>
          </>
        }
      >
        <Input
          label="Display name"
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
          autoFocus
        />
      </Dialog>

      <ConfirmDialog
        open={Boolean(trashTarget)}
        onClose={() => setTrashTarget(null)}
        onConfirm={() => void submitTrash()}
        title="Move to trash"
        description={
          trashTarget
            ? `“${trashTarget.name}” will be moved to trash. You can restore it later.`
            : undefined
        }
        confirmLabel="Move to trash"
        tone="danger"
        loading={busy}
      />
    </div>
  );
}
