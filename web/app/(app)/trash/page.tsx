"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { InlineLoader } from "@/components/ui/Loader";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { DocumentTable } from "@/components/documents/DocumentTable";
import { documentsApi } from "@/lib/api";
import type { Document } from "@/lib/types";
import { useSession } from "@/contexts/SessionContext";

export default function TrashPage() {
  const { session } = useSession();
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [target, setTarget] = useState<Document | null>(null);
  const [mode, setMode] = useState<"restore" | "purge">("restore");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await documentsApi.list({ includeDeleted: true, limit: 100 });
      setDocuments((res.documents || []).filter((d) => d.status === "soft_deleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load trash");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [session.tenantId, session.userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirm = async () => {
    if (!target) return;
    setBusy(true);
    try {
      if (mode === "restore") {
        await documentsApi.restore(target.id);
        toast.success("Restored");
      } else {
        await documentsApi.permanentDelete(target.id);
        toast.success("Permanently deleted");
      }
      setTarget(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Trash" subtitle="Soft-deleted documents — restore or erase permanently">
      <div className="mx-auto max-w-6xl space-y-4 animate-fade-up">
        <div className="flex justify-end">
          <Button variant="outlined" size="sm" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
        {loading ? (
          <InlineLoader />
        ) : (
          <DocumentTable
            documents={documents}
            showRestore
            onRestore={(d) => {
              setMode("restore");
              setTarget(d);
            }}
            onDelete={(d) => {
              setMode("purge");
              setTarget(d);
            }}
          />
        )}
      </div>

      <ConfirmDialog
        open={!!target}
        onClose={() => setTarget(null)}
        onConfirm={() => void confirm()}
        title={mode === "restore" ? "Restore document?" : "Delete forever?"}
        description={
          mode === "restore"
            ? `"${target?.name}" will return to the active library.`
            : `"${target?.name}" and its storage objects will be removed permanently.`
        }
        confirmLabel={mode === "restore" ? "Restore" : "Delete forever"}
        tone={mode === "restore" ? "info" : "danger"}
        loading={busy}
      />
    </AppShell>
  );
}
