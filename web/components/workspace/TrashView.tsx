"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { DocumentTable } from "@/components/documents/DocumentTable";
import { documentsApi } from "@/lib/api";
import type { Document } from "@/lib/types";

export function TrashView({ tenantId, basePath }: { tenantId: string; basePath: string }) {
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [target, setTarget] = useState<Document | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await documentsApi.list(tenantId, { includeDeleted: true, limit: 100 });
      setDocuments(result.documents.filter((document) => document.status === "soft_deleted"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load trash");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async (document: Document) => {
    try {
      await documentsApi.restore(tenantId, document.id);
      toast.success(`“${document.name}” restored`);
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Restore failed");
    }
  };

  const deleteForever = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await documentsApi.deleteForever(tenantId, target.id);
      toast.success("Document deleted permanently");
      setTarget(null);
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the document");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-[var(--text-secondary)]">
          Documents stay here until they are restored or deleted permanently. Permanent deletion also
          removes the objects from storage.
        </p>
        <Button variant="secondary" onClick={() => void load()} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
          Refresh
        </Button>
      </div>

      <Card padded={false}>
        {loading ? (
          <LoadingBlock label="Loading trash" />
        ) : documents.length === 0 ? (
          <EmptyState
            icon={<Trash2 className="h-4 w-4" />}
            title="Trash is empty"
            description="Deleted documents will appear here for review before permanent removal."
          />
        ) : (
          <DocumentTable
            documents={documents}
            basePath={basePath}
            actions={{
              onRestore: (document) => void restore(document),
              onDeleteForever: (document) => setTarget(document),
            }}
          />
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        onConfirm={() => void deleteForever()}
        title="Delete permanently"
        description={
          target
            ? `“${target.name}” and all of its versions will be removed from storage. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete permanently"
        tone="danger"
        loading={busy}
      />
    </div>
  );
}
