"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  History,
  Pencil,
  RotateCcw,
  Share2,
  Shield,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, DescriptionList } from "@/components/ui/Card";
import { Badge, LevelBadge, StatusBadge } from "@/components/ui/Badge";
import { EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { ConfirmDialog, Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { AccessDialog } from "@/components/documents/AccessDialog";
import { downloadDocument } from "./DocumentsView";
import { documentsApi } from "@/lib/api";
import type { Document, DocumentAccess, DocumentVersion } from "@/lib/types";
import { accessSourceLabel, formatBytes, formatDate, providerLabel } from "@/lib/utils";

export function DocumentDetailView({
  tenantId,
  basePath,
  documentId,
}: {
  tenantId: string;
  basePath: string;
  documentId: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [document, setDocument] = useState<Document | null>(null);
  const [access, setAccess] = useState<DocumentAccess | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [trashOpen, setTrashOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const detail = await documentsApi.get(tenantId, documentId, true);
      setDocument(detail.document);
      setAccess(detail.access);
      setRenameValue(detail.document.name);
      const versionResult = await documentsApi.listVersions(tenantId, documentId);
      setVersions(versionResult.versions || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load the document");
      setDocument(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitRename = async () => {
    if (!document || !renameValue.trim()) return;
    setBusy(true);
    try {
      const result = await documentsApi.rename(tenantId, document.id, { name: renameValue.trim() });
      setDocument(result.document);
      setRenameOpen(false);
      toast.success("Document renamed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  };

  const submitTrash = async () => {
    if (!document) return;
    setBusy(true);
    try {
      await documentsApi.moveToTrash(tenantId, document.id);
      toast.success("Moved to trash");
      setTrashOpen(false);
      router.push(`${basePath}/documents`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not move to trash");
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!document) return;
    try {
      await documentsApi.restore(tenantId, document.id);
      toast.success("Document restored");
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Restore failed");
    }
  };

  const uploadVersion = async (file: File) => {
    if (!document) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("filename", file.name);
      await documentsApi.addVersion(tenantId, document.id, form);
      toast.success("New version uploaded");
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the version");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (loading) return <LoadingBlock label="Loading document" />;

  if (!document) {
    return (
      <Card>
        <EmptyState
          title="Document unavailable"
          description="It may have been deleted, or you do not have access to it."
          action={
            <Link href={`${basePath}/documents`}>
              <Button size="sm" variant="secondary">
                Back to documents
              </Button>
            </Link>
          }
        />
      </Card>
    );
  }

  const trashed = document.status === "soft_deleted";

  return (
    <div className="space-y-4 animate-rise">
      <Link
        href={`${basePath}/documents`}
        className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All documents
      </Link>

      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[17px] font-semibold tracking-[-0.01em] text-[var(--text)]">
                {document.name}
              </h2>
              <StatusBadge status={document.status} />
              {access && <LevelBadge level={access.level} />}
            </div>
            <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]">
              {document.originalFilename} · {formatBytes(document.size)} · version{" "}
              {document.currentVersion}
            </p>
            {access && (
              <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-[var(--text-muted)]">
                <Shield className="h-3 w-3" />
                {accessSourceLabel(access.source)}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!trashed && (
              <Button
                variant="secondary"
                leftIcon={<Download className="h-3.5 w-3.5" />}
                onClick={() => {
                  void downloadDocument(tenantId, document).catch((error) =>
                    toast.error(error instanceof Error ? error.message : "Download failed")
                  );
                }}
              >
                Download
              </Button>
            )}
            {access?.canWrite && !trashed && (
              <>
                <Button
                  variant="secondary"
                  leftIcon={<Upload className="h-3.5 w-3.5" />}
                  loading={busy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  New version
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadVersion(file);
                  }}
                />
                <Button
                  variant="secondary"
                  leftIcon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={() => setRenameOpen(true)}
                >
                  Rename
                </Button>
              </>
            )}
            {access?.canAdmin && !trashed && (
              <Button leftIcon={<Share2 className="h-3.5 w-3.5" />} onClick={() => setShareOpen(true)}>
                Manage access
              </Button>
            )}
            {trashed && access?.canWrite && (
              <Button leftIcon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => void restore()}>
                Restore
              </Button>
            )}
            {access?.canDelete && !trashed && (
              <Button
                variant="secondary"
                leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={() => setTrashOpen(true)}
              >
                Trash
              </Button>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" padded={false}>
          <div className="p-4 sm:p-5">
            <CardHeader
              title="Version history"
              description="Every upload creates an immutable version in storage."
              className="mb-3"
            />
          </div>
          {versions.length === 0 ? (
            <EmptyState
              icon={<History className="h-4 w-4" />}
              title="No versions recorded"
              description="Versions appear once an upload completes."
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {versions.map((version) => (
                <li key={version.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <Badge tone={version.versionNumber === document.currentVersion ? "accent" : "neutral"}>
                    v{version.versionNumber}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] text-[var(--text)]">
                      {formatBytes(version.size)} · {version.mimeType}
                    </p>
                    <p className="truncate text-[11.5px] text-[var(--text-muted)]">
                      {formatDate(version.createdAt)} · {version.createdBy}
                    </p>
                  </div>
                  {!trashed && (
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Download className="h-3.5 w-3.5" />}
                      onClick={() => {
                        void downloadDocument(tenantId, document, version.versionNumber).catch((error) =>
                          toast.error(error instanceof Error ? error.message : "Download failed")
                        );
                      }}
                    >
                      Download
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Details" />
          <DescriptionList
            columns={1}
            items={[
              { label: "Document ID", value: document.id, mono: true },
              { label: "MIME type", value: document.mimeType },
              { label: "Storage provider", value: providerLabel(document.storageProvider) },
              { label: "Container", value: document.storageContainer, mono: true },
              { label: "Object key", value: document.storageKey, mono: true },
              { label: "Checksum", value: document.checksum || "Not recorded", mono: true },
              { label: "Created", value: `${formatDate(document.createdAt)} · ${document.createdBy}` },
              { label: "Last updated", value: `${formatDate(document.updatedAt)} · ${document.updatedBy}` },
            ]}
          />
        </Card>
      </div>

      <AccessDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        tenantId={tenantId}
        document={document}
      />

      <Dialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Rename document"
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setRenameOpen(false)}>
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
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        onConfirm={() => void submitTrash()}
        title="Move to trash"
        description={`“${document.name}” can be restored from trash later.`}
        confirmLabel="Move to trash"
        tone="danger"
        loading={busy}
      />
    </div>
  );
}
