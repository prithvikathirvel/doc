"use client";

import { use } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { UsersView } from "@/components/workspace/UsersView";

export default function AdminTenantUsersPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = use(params);
  return (
    <AdminShell
      tenantId={tenantId}
      title="People"
      subtitle="Everyone active in this tenant and the documents they own"
    >
      <UsersView tenantId={tenantId} basePath={`/admin/tenants/${tenantId}`} />
    </AdminShell>
  );
}
