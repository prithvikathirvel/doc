"use client";

import { use } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { DocumentsView } from "@/components/workspace/DocumentsView";

export default function AdminTenantDocumentsPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = use(params);
  return (
    <AdminShell tenantId={tenantId} title="Documents" subtitle="All documents stored in this tenant">
      <DocumentsView tenantId={tenantId} basePath={`/admin/tenants/${tenantId}`} />
    </AdminShell>
  );
}
