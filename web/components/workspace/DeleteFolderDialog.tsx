"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, FileText, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Feedback";
import { foldersApi } from "@/lib/api";
import type { Folder, FolderSummary } from "@/lib/types";
import { formatBytes, formatNumber } from "@/lib/utils";

/**
 * Two-step confirmation for a recursive folder delete: the dialog first shows what
 * the subtree contains, and a non-empty folder must be confirmed by typing its name.
 */
export function DeleteFolderDialog({
  tenantId,
  folder,
  onClose,
  onDeleted,
}: {
  tenantId: string;
  folder: Folder | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [summary, setSummary] = useState<FolderSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  const load = useCallback(async () => {
    if (!folder) return;
    setLoading(true);
    setConfirmation("");
    try {
      setSummary(await foldersApi.summary(tenantId, folder.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not inspect the folder");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [folder, tenantId]);

  useEffect(() => {
    if (folder) void load();
  }, [folder, load]);

  const hasContents = Boolean(summary && (summary.folders > 0 || summary.documents > 0));
  const confirmed = !hasContents || confirmation.trim() === folder?.name;

  const submit = async () => {
    if (!folder || !confirmed) return;
    setDeleting(true);
    try {
      const result = await foldersApi.remove(tenantId, folder.id);
      const { folders, documents } = result.deleted;
      toast.success(
        documents > 0
          ? `Deleted ${formatNumber(folders)} folder${folders === 1 ? "" : "s"} and moved ${formatNumber(
              documents
            )} document${documents === 1 ? "" : "s"} to trash`
          : `Deleted ${formatNumber(folders)} folder${folders === 1 ? "" : "s"}`
      );
      onClose();
      onDeleted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The folder could not be deleted");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog
      open={Boolean(folder)}
      onClose={onClose}
      title="Delete folder"
      description={folder ? `“${folder.name}” and everything inside it` : undefined}
      size="sm"
      dismissible={!deleting}
      icon={
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#fecdca] bg-[var(--danger-soft)] text-[var(--danger)]">
          <AlertTriangle className="h-4 w-4" />
        </span>
      }
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={deleting}
            disabled={loading || !confirmed}
            onClick={() => void submit()}
          >
            {hasContents ? "Delete everything" : "Delete folder"}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-[12.5px] text-[var(--text-secondary)]">
          <Spinner />
          Checking what this folder contains
        </div>
      ) : (
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3">
              <p className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-muted)]">
                <FolderOpen className="h-3.5 w-3.5" /> Sub-folders
              </p>
              <p className="mt-1 text-[18px] font-semibold text-[var(--text)]">
                {formatNumber(summary?.folders ?? 0)}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3">
              <p className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-muted)]">
                <FileText className="h-3.5 w-3.5" /> Documents
              </p>
              <p className="mt-1 text-[18px] font-semibold text-[var(--text)]">
                {formatNumber(summary?.documents ?? 0)}
              </p>
              <p className="text-[11px] text-[var(--text-muted)]">{formatBytes(summary?.bytes ?? 0)}</p>
            </div>
          </div>

          <p className="text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
            {hasContents
              ? "The folder, every sub-folder and all documents inside are removed. Documents move to trash and can be restored from there."
              : "This folder is empty and will be removed."}
          </p>

          {hasContents && (
            <Input
              label={`Type “${folder?.name}” to confirm`}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={folder?.name}
              autoFocus
            />
          )}
        </div>
      )}
    </Dialog>
  );
}
