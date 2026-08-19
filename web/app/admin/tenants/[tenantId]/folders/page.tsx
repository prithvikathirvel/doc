"use client";

import { use } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { FoldersView } from "@/components/workspace/FoldersView";

export default function AdminTenantFoldersPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = use(params);
  return (
    <AdminShell tenantId={tenantId} title="Folders" subtitle="Folder structure of this tenant">
      <FoldersView tenantId={tenantId} />
    </AdminShell>
  );
}
