"use client";

import { Suspense, use } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { LoadingBlock } from "@/components/ui/Feedback";
import { FilesView } from "@/components/workspace/FilesView";

export default function AdminTenantFilesPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = use(params);
  return (
    <AdminShell tenantId={tenantId} title="Files" subtitle="Folders and documents stored in this tenant">
      <Suspense fallback={<LoadingBlock />}>
        <FilesView tenantId={tenantId} basePath={`/admin/tenants/${tenantId}`} />
      </Suspense>
    </AdminShell>
  );
}
