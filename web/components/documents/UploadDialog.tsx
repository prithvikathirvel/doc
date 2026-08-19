"use client";

import { useRef, useState } from "react";
import { FileUp, Upload } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { documentsApi, pickSignedUrl } from "@/lib/api";
import type { Folder } from "@/lib/types";
import { formatBytes, cn } from "@/lib/utils";

export function UploadDialog({
  open,
  onClose,
  onUploaded,
  folders,
  defaultFolderId,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
  folders: Folder[];
  defaultFolderId?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState<string>(defaultFolderId || "");
  const [mode, setMode] = useState<"direct" | "signed">("direct");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const reset = () => {
    setFile(null);
    setName("");
    setFolderId(defaultFolderId || "");
    setMode("direct");
    setIdempotencyKey("");
    setLoading(false);
  };

  const handleClose = () => {
    if (loading) return;
    reset();
    onClose();
  };

  const pickFile = (f: File | null) => {
    setFile(f);
    if (f && !name) setName(f.name.replace(/\.[^.]+$/, "") || f.name);
  };

  const onSubmit = async () => {
    if (!file) {
      toast.error("Choose a file");
      return;
    }
    setLoading(true);
    try {
      if (mode === "direct") {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("filename", file.name);
        if (name.trim()) fd.append("name", name.trim());
        if (folderId) fd.append("folderId", folderId);
        await documentsApi.createDirect(fd);
        toast.success("Document uploaded");
      } else {
        const session = await documentsApi.createSession(
          {
            filename: file.name,
            name: name.trim() || undefined,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            folderId: folderId || null,
            idempotencyKey: idempotencyKey.trim() || undefined,
          },
          idempotencyKey.trim()
            ? { "idempotency-key": idempotencyKey.trim() }
            : undefined
        );

        const signed = pickSignedUrl(session);
        const uploadUrl = signed?.url;
        if (!uploadUrl) {
          // Some providers may not return signed URL — fall back to direct
          toast.message("No signed URL returned; trying direct upload path");
          const fd = new FormData();
          fd.append("file", file);
          fd.append("filename", file.name);
          if (name.trim()) fd.append("name", name.trim());
          if (folderId) fd.append("folderId", folderId);
          await documentsApi.createDirect(fd);
        } else {
          const method = (signed?.method || "PUT").toUpperCase();
          const headers: Record<string, string> = {
            "Content-Type": file.type || "application/octet-stream",
            ...(signed?.headers || {}),
          };
          const putRes = await fetch(uploadUrl, {
            method,
            headers,
            body: file,
          });
          if (!putRes.ok) {
            throw new Error(`Storage upload failed (${putRes.status})`);
          }
          await documentsApi.completeUpload(session.document.id, { size: file.size });
          toast.success("Signed upload completed");
        }
      }
      reset();
      onClose();
      onUploaded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Upload document"
      description="Small files can go through the API. Large files use a signed URL to storage."
      size="md"
      footer={
        <>
          <Button variant="outlined" size="sm" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void onSubmit()}
            loading={loading}
            leftIcon={<Upload className="h-3.5 w-3.5" />}
          >
            Upload
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) pickFile(f);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 transition-colors",
            dragOver
              ? "border-indigo-400 bg-indigo-50/60"
              : "border-slate-300 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-50"
          )}
        >
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600">
            <FileUp className="h-4 w-4" />
          </div>
          <p className="text-[13px] font-semibold text-slate-700">
            {file ? file.name : "Drop a file or click to browse"}
          </p>
          <p className="mt-0.5 text-[11.5px] text-slate-400">
            {file ? formatBytes(file.size) : "PDF, plain text, PNG, JPEG by default"}
          </p>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] || null)}
          />
        </div>

        <Input
          label="Display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Optional friendly name"
        />

        <Select
          label="Folder"
          value={folderId}
          onChange={(e) => setFolderId(e.target.value)}
          options={[
            { value: "", label: "Root (no folder)" },
            ...folders.map((f) => ({ value: f.id, label: f.path || f.name })),
          ]}
        />

        <Select
          label="Upload mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as "direct" | "signed")}
          options={[
            { value: "direct", label: "Direct (multipart through API)" },
            { value: "signed", label: "Signed URL (production path)" },
          ]}
          hint={
            mode === "signed"
              ? "Creates a pending document, PUTs to storage, then marks complete."
              : "Best for small files during local development."
          }
        />

        {mode === "signed" && (
          <Input
            label="Idempotency key"
            value={idempotencyKey}
            onChange={(e) => setIdempotencyKey(e.target.value)}
            placeholder="optional-unique-key"
            hint="Same key twice returns the same document."
            className="font-mono text-[12.5px]"
          />
        )}
      </div>
    </Dialog>
  );
}
