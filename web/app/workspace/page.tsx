"use client";

import Link from "next/link";
import { Upload } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingBlock } from "@/components/ui/Feedback";
import { AnalyticsView } from "@/components/workspace/AnalyticsView";
import { MemberOverview } from "@/components/workspace/MemberOverview";
import { useSession } from "@/contexts/SessionContext";
import { TENANT_ADMIN_ROLE } from "@/lib/session";

export default function WorkspaceOverviewPage() {
  const { session, tenant, storage, tenantLoading } = useSession();
  const tenantId = session?.tenantId || "";
  const isTenantAdmin = Boolean(session?.roles.includes(TENANT_ADMIN_ROLE));

  return (
    <WorkspaceShell
      title="Overview"
      subtitle={tenant ? `${tenant.name} · usage and recent activity` : "Usage and recent activity"}
      actions={
        <Link href="/workspace/documents">
          <Button leftIcon={<Upload className="h-3.5 w-3.5" />}>Upload document</Button>
        </Link>
      }
    >
      {!tenantId || (tenantLoading && !tenant) ? (
        <LoadingBlock label="Loading workspace" />
      ) : (
        <div className="space-y-4">
          {!storage && (
            <Card>
              <h2 className="text-[14px] font-semibold text-[var(--text)]">Storage is not configured</h2>
              <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]">
                A storage provider has not been attached to this workspace yet. Uploads and downloads
                stay unavailable until your platform administrator completes the setup.
              </p>
            </Card>
          )}
          {isTenantAdmin ? (
            <AnalyticsView tenantId={tenantId} basePath="/workspace" tenant={tenant} storage={storage} />
          ) : (
            <MemberOverview tenantId={tenantId} basePath="/workspace" />
          )}
        </div>
      )}
    </WorkspaceShell>
  );
}
