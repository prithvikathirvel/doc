"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog, ConfirmDialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { InlineLoader } from "@/components/ui/Loader";
import { EmptyState } from "@/components/ui/EmptyState";
import { foldersApi } from "@/lib/api";
import type { Folder as FolderType } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { useSession } from "@/contexts/SessionContext";

export default function FoldersPage() {
  const { session } = useSession();
  const [trail, setTrail] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: "Root" },
  ]);
  const parentId = trail[trail.length - 1]?.id ?? null;
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [renameFolder, setRenameFolder] = useState<FolderType | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteFolder, setDeleteFolder] = useState<FolderType | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await foldersApi.list(parentId);
      setFolders(res.folders || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load folders");
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, [parentId, session.tenantId, session.userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openFolder = (f: FolderType) => {
    setTrail((t) => [...t, { id: f.id, name: f.name }]);
  };

  const goTo = (index: number) => {
    setTrail((t) => t.slice(0, index + 1));
  };

  const submitCreate = async () => {
    if (!createName.trim()) return;
    setBusy(true);
    try {
      await foldersApi.create({ name: createName.trim(), parentId });
      toast.success("Folder created");
      setCreateOpen(false);
      setCreateName("");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const submitRename = async () => {
    if (!renameFolder || !renameValue.trim()) return;
    setBusy(true);
    try {
      await foldersApi.rename(renameFolder.id, renameValue.trim());
      toast.success("Renamed");
      setRenameFolder(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  };

  const submitDelete = async () => {
    if (!deleteFolder) return;
    setBusy(true);
    try {
      await foldersApi.remove(deleteFolder.id);
      toast.success("Folder deleted");
      setDeleteFolder(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Folders" subtitle="Organize documents into a folder tree">
      <div className="mx-auto max-w-5xl space-y-4 animate-fade-up">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap items-center gap-1 text-[13px]">
            {trail.map((t, i) => (
              <span key={`${t.id ?? "root"}-${i}`} className="inline-flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  className={
                    i === trail.length - 1
                      ? "font-semibold text-slate-800"
                      : "font-medium text-slate-500 hover:text-indigo-600"
                  }
                >
                  {t.name}
                </button>
              </span>
            ))}
          </nav>
          <div className="flex gap-2">
            <Link href={`/documents${parentId ? `?folderId=${parentId}` : ""}`}>
              <Button variant="outlined" size="sm">
                View documents
              </Button>
            </Link>
            <Button
              size="sm"
              leftIcon={<FolderPlus className="h-3.5 w-3.5" />}
              onClick={() => setCreateOpen(true)}
            >
              New folder
            </Button>
          </div>
        </div>

        <Card padding={false}>
          {loading ? (
            <InlineLoader />
          ) : folders.length === 0 ? (
            <EmptyState
              icon={<FolderOpen className="h-4 w-4" />}
              title="No folders here"
              description="Create a folder to group related documents."
              action={
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  New folder
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {folders.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50/70"
                >
                  <button
                    type="button"
                    onClick={() => openFolder(f)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-100 bg-amber-50 text-amber-600">
                      <Folder className="h-4 w-4" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-slate-800">{f.name}</p>
                      <p className="truncate text-[11px] text-slate-400">
                        {f.path} · {f.createdBy} · {formatDate(f.createdAt)}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                    onClick={() => {
                      setRenameFolder(f);
                      setRenameValue(f.name);
                    }}
                    title="Rename"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() => setDeleteFolder(f)}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openFolder(f)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create folder"
        description={parentId ? `Inside “${trail[trail.length - 1].name}”` : "At root level"}
        size="sm"
        footer={
          <>
            <Button variant="outlined" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={() => void submitCreate()}>
              Create
            </Button>
          </>
        }
      >
        <Input
          label="Name"
          value={createName}
          onChange={(e) => setCreateName(e.target.value)}
          placeholder="Contracts"
          autoFocus
        />
      </Dialog>

      <Dialog
        open={!!renameFolder}
        onClose={() => setRenameFolder(null)}
        title="Rename folder"
        size="sm"
        footer={
          <>
            <Button variant="outlined" size="sm" onClick={() => setRenameFolder(null)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={() => void submitRename()}>
              Save
            </Button>
          </>
        }
      >
        <Input label="Name" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
      </Dialog>

      <ConfirmDialog
        open={!!deleteFolder}
        onClose={() => setDeleteFolder(null)}
        onConfirm={() => void submitDelete()}
        title="Delete folder?"
        description={
          deleteFolder
            ? `"${deleteFolder.name}" will be soft-deleted. Documents inside are not automatically removed.`
            : undefined
        }
        confirmLabel="Delete"
        tone="danger"
        loading={busy}
      />
    </AppShell>
  );
}
