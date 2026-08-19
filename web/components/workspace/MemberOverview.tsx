"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileText, FolderOpen, HardDrive, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/Analytics";
import { EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { DocumentTable } from "@/components/documents/DocumentTable";
import { documentsApi, foldersApi } from "@/lib/api";
import type { Document } from "@/lib/types";
import { formatBytes, formatNumber } from "@/lib/utils";

/**
 * Overview for a workspace member: scoped to the documents they can actually reach,
 * unlike the tenant-wide analytics available to administrators.
 */
export function MemberOverview({ tenantId, basePath }: { tenantId: string; basePath: string }) {
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [total, setTotal] = useState(0);
  const [folderCount, setFolderCount] = useState(0);
  const [trashCount, setTrashCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [visible, withDeleted, folders] = await Promise.all([
        documentsApi.list(tenantId, { limit: 50 }),
        documentsApi.list(tenantId, { includeDeleted: true, limit: 100 }),
        foldersApi.list(tenantId),
      ]);
      const active = visible.documents.filter((document) => document.status !== "soft_deleted");
      setDocuments(active.slice(0, 6));
      setTotal(active.length);
      setTrashCount(withDeleted.documents.filter((document) => document.status === "soft_deleted").length);
      setFolderCount((folders.folders || []).length);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load the workspace");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingBlock label="Loading workspace" />;

  const usedBytes = documents.reduce((sum, document) => sum + document.size, 0);

  return (
    <div className="space-y-4 animate-rise">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Documents you can access"
          value={formatNumber(total)}
          icon={<FileText className="h-4 w-4" />}
          href={`${basePath}/documents`}
        />
        <StatCard
          label="Folders"
          value={formatNumber(folderCount)}
          icon={<FolderOpen className="h-4 w-4" />}
          href={`${basePath}/folders`}
        />
        <StatCard
          label="In trash"
          value={formatNumber(trashCount)}
          icon={<Trash2 className="h-4 w-4" />}
          href={`${basePath}/trash`}
        />
        <StatCard
          label="Recent volume"
          value={formatBytes(usedBytes)}
          hint="Across your latest documents"
          icon={<HardDrive className="h-4 w-4" />}
        />
      </div>

      <Card padded={false}>
        <div className="p-4 sm:p-5">
          <CardHeader
            title="Recent documents"
            description="The most recently updated documents you have access to"
            className="mb-0"
            action={
              <Link href={`${basePath}/documents`}>
                <Button size="sm" variant="secondary" leftIcon={<Upload className="h-3.5 w-3.5" />}>
                  Upload
                </Button>
              </Link>
            }
          />
        </div>
        {documents.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-4 w-4" />}
            title="Nothing here yet"
            description="Documents you upload or that are shared with you appear here."
          />
        ) : (
          <DocumentTable documents={documents} basePath={basePath} />
        )}
      </Card>
    </div>
  );
}
