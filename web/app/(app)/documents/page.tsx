"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { InlineLoader } from "@/components/ui/Loader";
import { AppShell as ShellFallback } from "@/components/layout/AppShell";
import { Dialog } from "@/components/ui/Dialog";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { DocumentTable } from "@/components/documents/DocumentTable";
import { UploadDialog } from "@/components/documents/UploadDialog";
import { documentsApi, foldersApi, pickSignedUrl } from "@/lib/api";
import type { Document, Folder } from "@/lib/types";
import { useSession } from "@/contexts/SessionContext";
import { loadSession } from "@/lib/session";

const PAGE_SIZE = 20;

function DocumentsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { session } = useSession();

  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [total, setTotal] = useState(0);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [folderId, setFolderId] = useState(searchParams.get("folderId") || "");
  const [page, setPage] = useState(1);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [renameDoc, setRenameDoc] = useState<Document | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteDoc, setDeleteDoc] = useState<Document | null>(null);
  const [shareDoc, setShareDoc] = useState<Document | null>(null);
  const [shareForm, setShareForm] = useState({
    principalType: "user" as "user" | "role",
    principalId: "",
    canRead: true,
    canWrite: false,
    canDelete: false,
    canAdmin: false,
  });
  const [busy, setBusy] = useState(false);

  const offset = (page - 1) * PAGE_SIZE;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [docRes, folderRes] = await Promise.all([
        documentsApi.list({
          q: q.trim() || undefined,
          folderId: folderId ? folderId : undefined,
          limit: PAGE_SIZE,
          offset,
        }),
        foldersApi.list(),
      ]);
      const list = docRes.documents || [];
      const active = list.filter((d) => d.status !== "soft_deleted");
      setDocuments(active);
      setTotal(typeof docRes.total === "number" ? docRes.total : active.length);
      // flatten folder list — list without parentId may return all or root depending on backend
      setFolders(folderRes.folders || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load documents");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [q, folderId, offset, session.tenantId, session.userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const qq = searchParams.get("q") || "";
    setQ(qq);
  }, [searchParams]);

  const folderOptions = useMemo(
    () => [
      { value: "", label: "All folders" },
      { value: "null", label: "Root only" },
      ...folders.map((f) => ({ value: f.id, label: f.path || f.name })),
    ],
    [folders]
  );

  const handleDownload = async (doc: Document) => {
    try {
      const res = await documentsApi.download(doc.id);
      const signed = pickSignedUrl(res);
      if (signed?.url) {
        window.open(signed.url, "_blank", "noopener,noreferrer");
        toast.success("Download link opened");
        return;
      }
      // stream fallback with auth headers
      const session = loadSession();
      const r = await fetch(documentsApi.contentUrl(doc.id), {
        headers: {
          "x-tenant-id": session.tenantId,
          "x-user-id": session.userId,
          "x-user-name": session.userName,
          "x-roles": session.roles.join(","),
        },
      });
      if (!r.ok) throw new Error("Download failed");
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = doc.originalFilename || doc.name;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Download started");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    }
  };

  const submitRename = async () => {
    if (!renameDoc || !renameValue.trim()) return;
    setBusy(true);
    try {
      await documentsApi.rename(renameDoc.id, { name: renameValue.trim() });
      toast.success("Renamed");
      setRenameDoc(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  };

  const submitDelete = async () => {
    if (!deleteDoc) return;
    setBusy(true);
    try {
      await documentsApi.softDelete(deleteDoc.id);
      toast.success("Moved to trash");
      setDeleteDoc(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const submitShare = async () => {
    if (!shareDoc || !shareForm.principalId.trim()) {
      toast.error("Principal ID is required");
      return;
    }
    setBusy(true);
    try {
      await documentsApi.grantPermission(shareDoc.id, {
        principalType: shareForm.principalType,
        principalId: shareForm.principalId.trim(),
        canRead: shareForm.canRead,
        canWrite: shareForm.canWrite,
        canDelete: shareForm.canDelete,
        canAdmin: shareForm.canAdmin,
      });
      toast.success("Permission granted");
      setShareDoc(null);
      setShareForm({
        principalType: "user",
        principalId: "",
        canRead: true,
        canWrite: false,
        canDelete: false,
        canAdmin: false,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Share failed");
    } finally {
      setBusy(false);
    }
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (folderId) params.set("folderId", folderId);
    router.replace(`/documents${params.toString() ? `?${params}` : ""}`);
    void load();
  };

  return (
    <AppShell title="Documents" subtitle="Browse, upload, share, and version files">
      <div className="mx-auto max-w-6xl space-y-4 animate-fade-up">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <form onSubmit={onSearch} className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name…"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13px] shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-600 focus:outline-none focus:ring-[3px] focus:ring-blue-600/15"
              />
            </div>
            <select
              value={folderId}
              onChange={(e) => {
                setFolderId(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] hover:border-slate-300 focus:border-blue-600 focus:outline-none focus:ring-[3px] focus:ring-blue-600/15"
            >
              {folderOptions.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outlined" size="sm">
              Search
            </Button>
          </form>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outlined"
              size="sm"
              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => void load()}
            >
              Refresh
            </Button>
            <Button
              size="sm"
              leftIcon={<Upload className="h-3.5 w-3.5" />}
              onClick={() => setUploadOpen(true)}
            >
              Upload
            </Button>
          </div>
        </div>

        {loading ? (
          <InlineLoader label="Loading documents…" />
        ) : (
          <>
            <DocumentTable
              documents={documents}
              onDownload={(d) => void handleDownload(d)}
              onRename={(d) => {
                setRenameDoc(d);
                setRenameValue(d.name);
              }}
              onDelete={setDeleteDoc}
              onShare={setShareDoc}
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
          </>
        )}
      </div>

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => void load()}
        folders={folders}
        defaultFolderId={folderId && folderId !== "null" ? folderId : null}
      />

      <Dialog
        open={!!renameDoc}
        onClose={() => setRenameDoc(null)}
        title="Rename document"
        description={renameDoc?.originalFilename}
        size="sm"
        footer={
          <>
            <Button variant="outlined" size="sm" onClick={() => setRenameDoc(null)}>
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
        open={!!deleteDoc}
        onClose={() => setDeleteDoc(null)}
        onConfirm={() => void submitDelete()}
        title="Move to trash?"
        description={
          deleteDoc
            ? `"${deleteDoc.name}" will be soft-deleted and can be restored later.`
            : undefined
        }
        confirmLabel="Move to trash"
        tone="danger"
        loading={busy}
      />

      <Dialog
        open={!!shareDoc}
        onClose={() => setShareDoc(null)}
        title="Share document"
        description={shareDoc ? `Grant access to “${shareDoc.name}”` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="outlined" size="sm" onClick={() => setShareDoc(null)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={() => void submitShare()}>
              Grant access
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select
            label="Principal type"
            value={shareForm.principalType}
            onChange={(e) =>
              setShareForm((f) => ({
                ...f,
                principalType: e.target.value as "user" | "role",
              }))
            }
            options={[
              { value: "user", label: "User" },
              { value: "role", label: "Role" },
            ]}
          />
          <Input
            label="Principal ID"
            value={shareForm.principalId}
            onChange={(e) => setShareForm((f) => ({ ...f, principalId: e.target.value }))}
            placeholder="e.g. bob"
            required
          />
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["canRead", "Read"],
                ["canWrite", "Write"],
                ["canDelete", "Delete"],
                ["canAdmin", "Admin"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={shareForm[key]}
                  onChange={(e) => setShareForm((f) => ({ ...f, [key]: e.target.checked }))}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </Dialog>
    </AppShell>
  );
}


export default function DocumentsPage() {
  return (
    <Suspense
      fallback={
        <ShellFallback title="Documents">
          <InlineLoader label="Loading documents…" />
        </ShellFallback>
      }
    >
      <DocumentsPageInner />
    </Suspense>
  );
}
