"use client";

import { use } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { UserDocumentsView } from "@/components/workspace/UserDocumentsView";

export default function AdminTenantUserPage({
  params,
}: {
  params: Promise<{ tenantId: string; userId: string }>;
}) {
  const { tenantId, userId } = use(params);
  const decoded = decodeURIComponent(userId);
  return (
    <AdminShell tenantId={tenantId} title={decoded} subtitle="Documents owned by this person">
      <UserDocumentsView
        tenantId={tenantId}
        basePath={`/admin/tenants/${tenantId}`}
        userId={decoded}
      />
    </AdminShell>
  );
}
