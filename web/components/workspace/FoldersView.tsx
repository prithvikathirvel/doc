"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, FolderOpen, FolderPlus, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, IconButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { ConfirmDialog, Dialog } from "@/components/ui/Dialog";
import { foldersApi } from "@/lib/api";
import type { Folder } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export function FoldersView({ tenantId, canManage = true }: { tenantId: string; canManage?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<Folder[]>([]);
  const [parentId, setParentId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [renameTarget, setRenameTarget] = useState<Folder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Folder | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await foldersApi.list(tenantId, parentId);
      setFolders(result.folders || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load folders");
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, parentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openFolder = (folder: Folder) => {
    setBreadcrumb((trail) => [...trail, folder]);
    setParentId(folder.id);
  };

  const goToLevel = (index: number) => {
    if (index < 0) {
      setBreadcrumb([]);
      setParentId(null);
      return;
    }
    const trail = breadcrumb.slice(0, index + 1);
    setBreadcrumb(trail);
    setParentId(trail[trail.length - 1]?.id ?? null);
  };

  const submitCreate = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await foldersApi.create(tenantId, { name: name.trim(), parentId });
      toast.success("Folder created");
      setCreateOpen(false);
      setName("");
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create folder");
    } finally {
      setBusy(false);
    }
  };

  const submitRename = async () => {
    if (!renameTarget || !name.trim()) return;
    setBusy(true);
    try {
      await foldersApi.rename(tenantId, renameTarget.id, name.trim());
      toast.success("Folder renamed");
      setRenameTarget(null);
      setName("");
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await foldersApi.remove(tenantId, deleteTarget.id);
      toast.success("Folder deleted");
      setDeleteTarget(null);
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete folder");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 text-[12.5px]">
          <button
            type="button"
            onClick={() => goToLevel(-1)}
            className="rounded-md px-1.5 py-1 font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
          >
            Root
          </button>
          {breadcrumb.map((folder, index) => (
            <span key={folder.id} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <button
                type="button"
                onClick={() => goToLevel(index)}
                className="max-w-[160px] truncate rounded-md px-1.5 py-1 font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
              >
                {folder.name}
              </button>
            </span>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => void load()} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
            Refresh
          </Button>
          {canManage && (
            <Button
              onClick={() => {
                setName("");
                setCreateOpen(true);
              }}
              leftIcon={<FolderPlus className="h-3.5 w-3.5" />}
            >
              New folder
            </Button>
          )}
        </div>
      </div>

      <Card padded={false}>
        {loading ? (
          <LoadingBlock label="Loading folders" />
        ) : folders.length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="h-4 w-4" />}
            title="No folders here"
            description="Folders keep documents organised and can be nested to any depth."
            action={
              canManage ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setName("");
                    setCreateOpen(true);
                  }}
                >
                  New folder
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {folders.map((folder) => (
              <li key={folder.id} className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => openFolder(folder)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-muted)]">
                    <FolderOpen className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-[var(--text)]">
                      {folder.name}
                    </span>
                    <span className="block truncate font-mono text-[11.5px] text-[var(--text-muted)]">
                      {folder.path}
                    </span>
                  </span>
                </button>
                <span className="hidden shrink-0 text-[12px] text-[var(--text-muted)] sm:block">
                  {formatDate(folder.createdAt)}
                </span>
                {canManage && (
                  <span className="flex shrink-0 items-center gap-0.5">
                    <IconButton
                      label="Rename folder"
                      onClick={() => {
                        setRenameTarget(folder);
                        setName(folder.name);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton label="Delete folder" tone="danger" onClick={() => setDeleteTarget(folder)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog
        open={createOpen || Boolean(renameTarget)}
        onClose={() => {
          setCreateOpen(false);
          setRenameTarget(null);
        }}
        title={renameTarget ? "Rename folder" : "New folder"}
        description={
          renameTarget
            ? undefined
            : parentId
              ? `Created inside “${breadcrumb[breadcrumb.length - 1]?.name}”`
              : "Created at the root of the workspace"
        }
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setCreateOpen(false);
                setRenameTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              loading={busy}
              onClick={() => void (renameTarget ? submitRename() : submitCreate())}
            >
              {renameTarget ? "Save" : "Create folder"}
            </Button>
          </>
        }
      >
        <Input
          label="Folder name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Contracts"
          autoFocus
          required
        />
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void submitDelete()}
        title="Delete folder"
        description={
          deleteTarget
            ? `“${deleteTarget.name}” will be removed. Documents inside stay in the workspace.`
            : undefined
        }
        confirmLabel="Delete folder"
        tone="danger"
        loading={busy}
      />
    </div>
  );
}
