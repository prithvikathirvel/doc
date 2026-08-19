"use client";

import { useRef, useState } from "react";
import { FileUp, Upload } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { documentsApi, pickSignedUrl } from "@/lib/api";
import type { Folder } from "@/lib/types";
import { cn, formatBytes } from "@/lib/utils";

/**
 * Uploads go through a signed URL when the tenant's storage provider supports it,
 * and fall back to a direct upload through the API otherwise.
 */
export function UploadDialog({
  open,
  onClose,
  onUploaded,
  tenantId,
  folders,
  defaultFolderId,
  maxFileSizeBytes,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
  tenantId: string;
  folders: Folder[];
  defaultFolderId?: string | null;
  maxFileSizeBytes?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState(defaultFolderId || "");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const reset = () => {
    setFile(null);
    setName("");
    setFolderId(defaultFolderId || "");
    setUploading(false);
  };

  const close = () => {
    if (uploading) return;
    reset();
    onClose();
  };

  const pickFile = (next: File | null) => {
    if (!next) return;
    if (maxFileSizeBytes && next.size > maxFileSizeBytes) {
      toast.error(`This workspace allows files up to ${formatBytes(maxFileSizeBytes)}`);
      return;
    }
    setFile(next);
    if (!name) setName(next.name.replace(/\.[^.]+$/, "") || next.name);
  };

  const submit = async () => {
    if (!file) {
      toast.error("Choose a file to upload");
      return;
    }
    setUploading(true);
    try {
      const session = await documentsApi.createSession(tenantId, {
        filename: file.name,
        name: name.trim() || undefined,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        folderId: folderId || null,
      });
      const signed = pickSignedUrl(session);

      if (signed?.url) {
        const response = await fetch(signed.url, {
          method: (signed.method || "PUT").toUpperCase(),
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            ...(signed.headers || {}),
          },
          body: file,
        });
        if (!response.ok) throw new Error(`Storage rejected the upload (${response.status})`);
        await documentsApi.completeUpload(tenantId, session.document.id, { size: file.size });
      } else {
        const form = new FormData();
        form.append("file", file);
        form.append("filename", file.name);
        if (name.trim()) form.append("name", name.trim());
        if (folderId) form.append("folderId", folderId);
        await documentsApi.uploadDirect(tenantId, form);
      }

      toast.success(`${file.name} uploaded`);
      reset();
      onClose();
      onUploaded();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Upload document"
      description="The file is stored in this tenant's configured storage provider."
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={close} disabled={uploading}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void submit()}
            loading={uploading}
            leftIcon={<Upload className="h-3.5 w-3.5" />}
          >
            Upload
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            pickFile(event.dataTransfer.files?.[0] || null);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-9 text-center transition-colors",
            dragging
              ? "border-[var(--accent)] bg-[var(--accent-soft)]"
              : "border-[var(--border-strong)] bg-[var(--surface-muted)] hover:border-[var(--accent)]"
          )}
        >
          <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-white text-[var(--text-muted)]">
            <FileUp className="h-4 w-4" />
          </span>
          <p className="text-[13px] font-medium text-[var(--text)]">
            {file ? file.name : "Drop a file here or click to browse"}
          </p>
          <p className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">
            {file
              ? formatBytes(file.size)
              : maxFileSizeBytes
                ? `Up to ${formatBytes(maxFileSizeBytes)} per file`
                : "Any file allowed by this workspace"}
          </p>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(event) => pickFile(event.target.files?.[0] || null)}
          />
        </div>

        <Input
          label="Display name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Defaults to the file name"
        />

        <Select
          label="Folder"
          value={folderId}
          onChange={(event) => setFolderId(event.target.value)}
          options={[
            { value: "", label: "Root" },
            ...folders.map((folder) => ({ value: folder.id, label: folder.path || folder.name })),
          ]}
        />
      </div>
    </Dialog>
  );
}
