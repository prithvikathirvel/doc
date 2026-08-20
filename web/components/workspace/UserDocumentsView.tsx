"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, History, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/Analytics";
import { EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { DocumentTable } from "@/components/documents/DocumentTable";
import { AccessDialog } from "@/components/documents/AccessDialog";
import { downloadDocument } from "@/lib/download";
import { documentsApi, tenantsApi } from "@/lib/api";
import type { Document, TenantUser } from "@/lib/types";
import { formatBytes, formatDate, formatNumber } from "@/lib/utils";

/**
 * Everything one person owns inside a tenant: their documents, with the version
 * history one click away on each document.
 */
export function UserDocumentsView({
  tenantId,
  basePath,
  userId,
}: {
  tenantId: string;
  basePath: string;
  userId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [profile, setProfile] = useState<TenantUser | null>(null);
  const [shareTarget, setShareTarget] = useState<Document | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [documentResult, userResult] = await Promise.all([
        documentsApi.list(tenantId, { createdBy: userId, includeDeleted: true, limit: 100 }),
        tenantsApi.users(tenantId).catch(() => ({ users: [] as TenantUser[] })),
      ]);
      setDocuments(documentResult.documents);
      setProfile(userResult.users.find((user) => user.userId === userId) || null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load this person's documents");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = documents.filter((document) => document.status !== "soft_deleted");
  const trashed = documents.filter((document) => document.status === "soft_deleted");
  const totalBytes = active.reduce((sum, document) => sum + document.size, 0);
  const totalVersions = active.reduce((sum, document) => sum + document.currentVersion, 0);

  return (
    <div className="space-y-4 animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`${basePath}/users`}
          className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All people
        </Link>
        <Button variant="secondary" size="sm" onClick={() => void load()} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
          Refresh
        </Button>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[17px] font-semibold tracking-[-0.01em] text-[var(--text)]">
                {userId}
              </h2>
              {profile?.isOwner && (
                <Badge tone="accent">
                  <ShieldCheck className="h-3 w-3" /> Workspace owner
                </Badge>
              )}
            </div>
            <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]">
              First activity {profile?.firstActivityAt ? formatDate(profile.firstActivityAt) : "—"} · last
              activity {profile?.lastActivityAt ? formatDate(profile.lastActivityAt) : "—"}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Documents owned" value={formatNumber(active.length)} icon={<FileText className="h-4 w-4" />} loading={loading} />
        <StatCard label="Storage used" value={formatBytes(totalBytes)} loading={loading} />
        <StatCard label="Versions" value={formatNumber(profile?.versions ?? totalVersions)} icon={<History className="h-4 w-4" />} loading={loading} />
        <StatCard
          label="Shared with them"
          value={formatNumber(profile?.sharedWithThem ?? 0)}
          hint="Documents owned by others"
          loading={loading}
        />
      </div>

      <Card padded={false}>
        <div className="p-4 sm:p-5">
          <CardHeader
            title="Documents"
            description="Open a document to review or download its version history"
            className="mb-0"
          />
        </div>
        {loading ? (
          <LoadingBlock label="Loading documents" />
        ) : active.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-4 w-4" />}
            title="No documents"
            description="This person has not created any documents in this workspace."
          />
        ) : (
          <DocumentTable
            documents={active}
            basePath={basePath}
            actions={{
              onDownload: (document) => {
                void downloadDocument(tenantId, document).catch((error) =>
                  toast.error(error instanceof Error ? error.message : "Download failed")
                );
              },
              onShare: (document) => setShareTarget(document),
            }}
          />
        )}
      </Card>

      {trashed.length > 0 && (
        <Card padded={false}>
          <div className="p-4 sm:p-5">
            <CardHeader
              title="In trash"
              description="Deleted documents that can still be restored"
              className="mb-0"
            />
          </div>
          <DocumentTable documents={trashed} basePath={basePath} />
        </Card>
      )}

      <AccessDialog
        open={Boolean(shareTarget)}
        onClose={() => setShareTarget(null)}
        tenantId={tenantId}
        document={shareTarget}
      />
    </div>
  );
}
