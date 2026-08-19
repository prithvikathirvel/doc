"use client";

import { use } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { TrashView } from "@/components/workspace/TrashView";

export default function AdminTenantTrashPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = use(params);
  return (
    <AdminShell tenantId={tenantId} title="Trash" subtitle="Deleted documents pending restore or removal">
      <TrashView tenantId={tenantId} basePath={`/admin/tenants/${tenantId}`} />
    </AdminShell>
  );
}
