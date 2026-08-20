"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Clock, FileText, FolderOpen, HardDrive, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { BarList, StatCard, TrendChart } from "@/components/ui/Analytics";
import { EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { tenantsApi } from "@/lib/api";
import type { TenantAnalytics, TenantStorageConfig } from "@/lib/types";
import {
  auditActionLabel,
  formatBytes,
  formatDate,
  formatNumber,
  formatRelative,
  providerLabel,
} from "@/lib/utils";

/** Usage analytics for one tenant, shared by the admin console and the tenant workspace. */
export function AnalyticsView({
  tenantId,
  basePath,
  storage,
}: {
  tenantId: string;
  basePath: string;
  storage: TenantStorageConfig | null;
}) {
  const [analytics, setAnalytics] = useState<TenantAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await tenantsApi.analytics(tenantId);
      setAnalytics(result.analytics);
      setFailed(false);
    } catch (error) {
      setFailed(true);
      toast.error(error instanceof Error ? error.message : "Unable to load analytics");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !analytics) return <LoadingBlock label="Loading analytics" />;

  if (failed || !analytics) {
    return (
      <Card>
        <EmptyState
          icon={<Activity className="h-4 w-4" />}
          title="Analytics unavailable"
          description="The analytics service did not return data for this tenant."
          action={
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      </Card>
    );
  }

  const totalBytes = analytics.storage.activeBytes + analytics.storage.versionBytes;

  return (
    <div className="space-y-4 animate-rise">
      {/* Row 1 — headline numbers */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active documents"
          value={formatNumber(analytics.documents.active)}
          hint={`${formatNumber(analytics.documents.createdLast30Days)} added in 30 days`}
          icon={<FileText className="h-4 w-4" />}
          href={`${basePath}/documents`}
        />
        <StatCard
          label="Storage used"
          value={formatBytes(totalBytes)}
          hint={`${formatBytes(analytics.storage.activeBytes)} current · ${formatBytes(
            analytics.storage.versionBytes
          )} versions`}
          icon={<HardDrive className="h-4 w-4" />}
        />
        <StatCard
          label="Folders"
          value={formatNumber(analytics.folders.total)}
          hint={`${formatNumber(analytics.versions.total)} stored versions`}
          icon={<FolderOpen className="h-4 w-4" />}
          href={`${basePath}/documents`}
        />
        <StatCard
          label="In trash"
          value={formatNumber(analytics.documents.inTrash)}
          hint={`${formatBytes(analytics.storage.trashBytes)} recoverable`}
          icon={<Trash2 className="h-4 w-4" />}
          href={`${basePath}/trash`}
        />
      </div>

      {/* Row 2 — upload activity across the full width */}
      <Card>
        <CardHeader
          title="Upload activity"
          description="Documents created per day over the last 30 days"
          action={
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] text-[var(--text-muted)]">
                Updated {formatRelative(analytics.generatedAt)}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void load()}
                leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
              >
                Refresh
              </Button>
            </div>
          }
        />
        <TrendChart points={analytics.uploadTrend} height={200} />
      </Card>

      {/* Row 3 — status, file types and contributors side by side */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Document status" description="Across the whole tenant" />
          <ul className="space-y-2.5">
            {[
              { label: "Active", value: analytics.documents.active, tone: "success" as const },
              { label: "Pending upload", value: analytics.documents.pendingUpload, tone: "warning" as const },
              { label: "Failed", value: analytics.documents.failed, tone: "danger" as const },
              { label: "In trash", value: analytics.documents.inTrash, tone: "neutral" as const },
            ].map((entry) => (
              <li key={entry.label} className="flex items-center justify-between gap-3">
                <Badge tone={entry.tone} dot>
                  {entry.label}
                </Badge>
                <span className="text-[13px] font-medium text-[var(--text)]">
                  {formatNumber(entry.value)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-3.5 text-[12.5px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--text-secondary)]">Average document</span>
              <span className="font-medium">{formatBytes(analytics.storage.averageDocumentBytes)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--text-secondary)]">Largest document</span>
              <span className="font-medium">{formatBytes(analytics.storage.largestDocumentBytes)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--text-secondary)]">Storage provider</span>
              <span className="font-medium">{providerLabel(storage?.provider)}</span>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="File types" description="Most common MIME types" />
          <BarList
            items={analytics.fileTypes.map((entry) => ({
              label: entry.mimeType,
              value: entry.documents,
              caption: `${formatNumber(entry.documents)} · ${formatBytes(entry.bytes)}`,
            }))}
            emptyLabel="No documents uploaded yet"
          />
        </Card>

        <Card>
          <CardHeader
            title="Top contributors"
            description={`${formatNumber(analytics.contributors.total)} people have uploaded documents`}
          />
          <BarList
            items={analytics.contributors.top.map((entry) => ({
              label: entry.userId,
              value: entry.documents,
              caption: `${formatNumber(entry.documents)} · ${formatBytes(entry.bytes)}`,
            }))}
            emptyLabel="No uploads recorded yet"
          />
        </Card>
      </div>

      {/* Row 4 — audited activity */}
      <Card padded={false}>
        <div className="p-4 sm:p-5">
          <CardHeader
            title="Recent activity"
            description="Latest audited operations in this tenant"
            className="mb-0"
          />
        </div>
        {analytics.recentActivity.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-4 w-4" />}
            title="No activity yet"
            description="Uploads, downloads and deletions appear here."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {analytics.recentActivity.map((entry, index) => (
              <li
                key={`${entry.resourceId}-${index}`}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="text-[12.5px] font-medium text-[var(--text)]">
                    {auditActionLabel(entry.action)}
                  </span>
                  {!entry.success && <Badge tone="danger">Failed</Badge>}
                </div>
                <p className="truncate text-[11.5px] text-[var(--text-muted)]">
                  {entry.actorId} · {formatDate(entry.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
