"use client";

import { use } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { TenantSettingsView } from "@/components/tenants/TenantSettingsView";

export default function AdminTenantSettingsPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = use(params);
  return (
    <AdminShell tenantId={tenantId} title="Tenant settings" subtitle="Profile, limits and storage target">
      <TenantSettingsView tenantId={tenantId} canEditProfile />
    </AdminShell>
  );
}
