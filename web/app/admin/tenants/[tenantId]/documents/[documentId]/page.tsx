"use client";

import { use } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { DocumentDetailView } from "@/components/workspace/DocumentDetailView";

export default function AdminTenantDocumentPage({
  params,
}: {
  params: Promise<{ tenantId: string; documentId: string }>;
}) {
  const { tenantId, documentId } = use(params);
  return (
    <AdminShell tenantId={tenantId} title="Document" subtitle="Versions, metadata and access">
      <DocumentDetailView
        tenantId={tenantId}
        basePath={`/admin/tenants/${tenantId}`}
        documentId={documentId}
      />
    </AdminShell>
  );
}
