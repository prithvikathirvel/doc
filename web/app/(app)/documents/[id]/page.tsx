"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileText,
  History,
  Pencil,
  Share2,
  Shield,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { InlineLoader } from "@/components/ui/Loader";
import { Dialog, ConfirmDialog } from "@/components/ui/Dialog";
import { Input, Select } from "@/components/ui/Input";
import { documentsApi, pickSignedUrl } from "@/lib/api";
import type { Document, DocumentPermission, DocumentVersion } from "@/lib/types";
import { formatBytes, formatDate, providerLabel } from "@/lib/utils";
import { loadSession } from "@/lib/session";

export default function DocumentDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [doc, setDoc] = useState<Document | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [permissions, setPermissions] = useState<DocumentPermission[]>([]);
  const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [permDeleteOpen, setPermDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [shareForm, setShareForm] = useState({
    principalType: "user" as "user" | "role",
    principalId: "",
    canRead: true,
    canWrite: false,
    canDelete: false,
    canAdmin: false,
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, v, p, m] = await Promise.allSettled([
        documentsApi.get(id, true),
        documentsApi.listVersions(id),
        documentsApi.listPermissions(id),
        documentsApi.metadata(id),
      ]);
      if (d.status === "fulfilled") {
        setDoc(d.value.document);
        setRenameValue(d.value.document.name);
      } else {
        throw d.reason;
      }
      if (v.status === "fulfilled") setVersions(v.value.versions || []);
      if (p.status === "fulfilled") setPermissions(p.value.permissions || []);
      if (m.status === "fulfilled") setMetadata(m.value);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load document");
      setDoc(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDownload = async (versionNumber?: number) => {
    if (!doc) return;
    try {
      const res = await documentsApi.download(doc.id, versionNumber);
      const signed = pickSignedUrl(res);
      if (signed?.url) {
        window.open(signed.url, "_blank", "noopener,noreferrer");
        return;
      }
      const session = loadSession();
      const r = await fetch(documentsApi.contentUrl(doc.id, versionNumber), {
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    }
  };

  const submitRename = async () => {
    if (!doc || !renameValue.trim()) return;
    setBusy(true);
    try {
      const res = await documentsApi.rename(doc.id, { name: renameValue.trim() });
      setDoc(res.document);
      setRenameOpen(false);
      toast.success("Renamed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  };

  const submitSoftDelete = async () => {
    if (!doc) return;
    setBusy(true);
    try {
      const res = await documentsApi.softDelete(doc.id);
      setDoc(res.document);
      setDeleteOpen(false);
      toast.success("Moved to trash");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const submitPermanentDelete = async () => {
    if (!doc) return;
    setBusy(true);
    try {
      await documentsApi.permanentDelete(doc.id);
      setPermDeleteOpen(false);
      toast.success("Permanently deleted");
      router.push("/documents");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const submitRestore = async () => {
    if (!doc) return;
    setBusy(true);
    try {
      const res = await documentsApi.restore(doc.id);
      setDoc(res.document);
      toast.success("Restored");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  };

  const submitShare = async () => {
    if (!doc || !shareForm.principalId.trim()) {
      toast.error("Enter a user ID or role name");
      return;
    }
    if (!shareForm.canRead && !shareForm.canWrite && !shareForm.canDelete && !shareForm.canAdmin) {
      toast.error("Select at least one access level");
      return;
    }
    setBusy(true);
    try {
      await documentsApi.grantPermission(doc.id, {
        ...shareForm,
        principalId: shareForm.principalId.trim(),
      });
      toast.success("Permission granted");
      setShareOpen(false);
      setShareForm({
        principalType: "user",
        principalId: "",
        canRead: true,
        canWrite: false,
        canDelete: false,
        canAdmin: false,
      });
      const p = await documentsApi.listPermissions(doc.id);
      setPermissions(p.permissions || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Share failed");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (permissionId: string) => {
    if (!doc) return;
    try {
      await documentsApi.revokePermission(doc.id, permissionId);
      toast.success("Permission revoked");
      setPermissions((prev) => prev.filter((p) => p.id !== permissionId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revoke failed");
    }
  };

  const submitVersion = async () => {
    if (!doc || !versionFile) {
      toast.error("Choose a file");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", versionFile);
      fd.append("filename", versionFile.name);
      const res = await documentsApi.createVersionDirect(doc.id, fd);
      setDoc(res.document);
      setVersionOpen(false);
      setVersionFile(null);
      toast.success("New version uploaded");
      const v = await documentsApi.listVersions(doc.id);
      setVersions(v.versions || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Version upload failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="Document">
        <InlineLoader />
      </AppShell>
    );
  }

  if (!doc) {
    return (
      <AppShell title="Document">
        <div className="mx-auto max-w-lg py-16 text-center">
          <p className="text-sm font-semibold text-slate-700">Document not found</p>
          <Link href="/documents" className="mt-4 inline-block">
            <Button variant="outlined" size="sm">
              Back to documents
            </Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={doc.name} subtitle={doc.originalFilename}>
      <div className="mx-auto max-w-5xl space-y-4 animate-fade-up">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/documents"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Documents
          </Link>
          <div className="flex flex-wrap gap-2">
            {doc.status === "active" && (
              <>
                <Button
                  variant="outlined"
                  size="sm"
                  leftIcon={<Download className="h-3.5 w-3.5" />}
                  onClick={() => void handleDownload()}
                >
                  Download
                </Button>
                <Button
                  variant="outlined"
                  size="sm"
                  leftIcon={<Upload className="h-3.5 w-3.5" />}
                  onClick={() => setVersionOpen(true)}
                >
                  New version
                </Button>
                <Button
                  variant="outlined"
                  size="sm"
                  leftIcon={<Share2 className="h-3.5 w-3.5" />}
                  onClick={() => setShareOpen(true)}
                >
                  Share
                </Button>
                <Button
                  variant="outlined"
                  size="sm"
                  leftIcon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={() => setRenameOpen(true)}
                >
                  Rename
                </Button>
                <Button
                  variant="outlined"
                  size="sm"
                  leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={() => setDeleteOpen(true)}
                  className="text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                >
                  Trash
                </Button>
              </>
            )}
            {doc.status === "soft_deleted" && (
              <>
                <Button size="sm" onClick={() => void submitRestore()} loading={busy}>
                  Restore
                </Button>
                <Button variant="danger" size="sm" onClick={() => setPermDeleteOpen(true)}>
                  Delete forever
                </Button>
              </>
            )}
            {doc.status === "pending_upload" && (
              <Badge tone="amber">Awaiting storage upload completion</Badge>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold tracking-tight text-slate-900">{doc.name}</h2>
                  <StatusBadge status={doc.status} />
                </div>
                <p className="mt-0.5 font-mono text-[12px] text-slate-400">{doc.id}</p>
              </div>
            </div>

            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["Original file", doc.originalFilename],
                  ["MIME type", doc.mimeType || "—"],
                  ["Size", formatBytes(doc.size)],
                  ["Version", `v${doc.currentVersion}`],
                  ["Created by", doc.createdBy],
                  ["Updated by", doc.updatedBy],
                  ["Created", formatDate(doc.createdAt)],
                  ["Updated", formatDate(doc.updatedAt)],
                  ["Provider", providerLabel(doc.storageProvider)],
                  ["Container", doc.storageContainer],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{k}</dt>
                  <dd className="mt-0.5 truncate text-[13px] font-medium text-slate-800">{v}</dd>
                </div>
              ))}
            </dl>

            {doc.storageKey && (
              <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Storage key</p>
                <p className="mt-0.5 break-all font-mono text-[12px] text-slate-700">{doc.storageKey}</p>
              </div>
            )}
          </Card>

          <div className="space-y-4 lg:col-span-2">
            <Card padding={false}>
              <div className="border-b border-slate-100 px-5 py-4">
                <CardHeader
                  className="mb-0"
                  title={
                    <span className="inline-flex items-center gap-1.5">
                      <History className="h-3.5 w-3.5 text-slate-400" /> Versions
                    </span>
                  }
                  description="DMS-level version history"
                />
              </div>
              {versions.length === 0 ? (
                <p className="px-5 py-8 text-center text-[13px] text-slate-400">No versions listed</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {versions
                    .slice()
                    .sort((a, b) => b.versionNumber - a.versionNumber)
                    .map((v) => (
                      <li key={v.id} className="flex items-center gap-3 px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-slate-800">
                            Version {v.versionNumber}
                            {v.versionNumber === doc.currentVersion && (
                              <Badge tone="indigo" className="ml-2">
                                current
                              </Badge>
                            )}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {formatBytes(v.size)} · {v.createdBy} · {formatDate(v.createdAt)}
                          </p>
                        </div>
                        <Button variant="text" size="sm" onClick={() => void handleDownload(v.versionNumber)}>
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                </ul>
              )}
            </Card>

            <Card padding={false}>
              <div className="border-b border-slate-100 px-5 py-4">
                <CardHeader
                  className="mb-0"
                  title={
                    <span className="inline-flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-slate-400" /> Permissions
                    </span>
                  }
                  description="Grant least-privilege access to a user or role"
                  action={
                    doc.status !== "soft_deleted" ? (
                      <Button variant="text" size="sm" onClick={() => setShareOpen(true)}>
                        Grant
                      </Button>
                    ) : undefined
                  }
                />
              </div>
              {permissions.length === 0 ? (
                <p className="px-5 py-8 text-center text-[13px] text-slate-400">No explicit grants</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {permissions.map((p) => (
                    <li key={p.id} className="flex items-start gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-slate-800">
                          {p.principalId}
                          <span className="ml-1.5 text-[11px] font-medium text-slate-400">{p.principalType}</span>
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {p.canRead && <Badge tone="emerald">read</Badge>}
                          {p.canWrite && <Badge tone="blue">write</Badge>}
                          {p.canDelete && <Badge tone="amber">delete</Badge>}
                          {p.canAdmin && <Badge tone="violet">admin</Badge>}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void revoke(p.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="Revoke"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>

        {metadata && (
          <Card>
            <CardHeader title="Storage metadata" description="DMS + object store details" />
            <pre className="max-h-64 overflow-auto rounded-lg border border-slate-100 bg-slate-50/80 p-3 font-mono text-[12px] leading-relaxed text-slate-700">
              {JSON.stringify(metadata, null, 2)}
            </pre>
          </Card>
        )}
      </div>

      <Dialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Rename document"
        size="sm"
        footer={
          <>
            <Button variant="outlined" size="sm" onClick={() => setRenameOpen(false)}>
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
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void submitSoftDelete()}
        title="Move to trash?"
        description="You can restore this document later from Trash."
        confirmLabel="Move to trash"
        tone="danger"
        loading={busy}
      />

      <ConfirmDialog
        open={permDeleteOpen}
        onClose={() => setPermDeleteOpen(false)}
        onConfirm={() => void submitPermanentDelete()}
        title="Delete forever?"
        description="This removes the document metadata and storage objects. This cannot be undone."
        confirmLabel="Delete forever"
        tone="danger"
        loading={busy}
      />

      <Dialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Grant permission"
        size="sm"
        footer={
          <>
            <Button variant="outlined" size="sm" onClick={() => setShareOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={() => void submitShare()}>
              Grant
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select
            label="Principal type"
            value={shareForm.principalType}
            onChange={(e) =>
              setShareForm((f) => ({ ...f, principalType: e.target.value as "user" | "role" }))
            }
            options={[
              { value: "user", label: "User" },
              { value: "role", label: "Role" },
            ]}
          />
          <Input
            label={shareForm.principalType === "user" ? "User ID" : "Role name"}
            value={shareForm.principalId}
            onChange={(e) => setShareForm((f) => ({ ...f, principalId: e.target.value }))}
            placeholder={shareForm.principalType === "user" ? "e.g. bob" : "e.g. reviewers"}
          />
          <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Access levels</p><div className="grid grid-cols-2 gap-2">
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
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
              >
                <input
                  type="checkbox"
                  checked={shareForm[key]}
                  onChange={(e) => setShareForm((f) => ({ ...f, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div></div>
        </div>
      </Dialog>

      <Dialog
        open={versionOpen}
        onClose={() => setVersionOpen(false)}
        title="Upload new version"
        description="Creates a new DMS-level version of this document."
        size="sm"
        footer={
          <>
            <Button variant="outlined" size="sm" onClick={() => setVersionOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={() => void submitVersion()}>
              Upload version
            </Button>
          </>
        }
      >
        <input
          type="file"
          onChange={(e) => setVersionFile(e.target.files?.[0] || null)}
          className="block w-full text-[13px] text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-[12px] file:font-semibold file:text-indigo-700"
        />
      </Dialog>
    </AppShell>
  );
}
