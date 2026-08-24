"use client";

import { useEffect, use, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Button } from "@/components/ui/Button";
import { LoadingBlock } from "@/components/ui/Feedback";
import { TenantDocsManager } from "@/components/tenants/TenantDocsManager";
import { tenantsApi } from "@/lib/api";
import type { Tenant } from "@/lib/types";

export default function TenantDocsAdminPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = use(params);
  const [tenant, setTenant] = useState<Tenant | null>(null);

  useEffect(() => {
    let cancelled = false;
    void tenantsApi
      .get(tenantId)
      .then((result) => {
        if (!cancelled) setTenant(result.tenant);
      })
      .catch(() => {
        /* the manager still loads the documentation config independently */
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return (
    <AdminShell
      title="Developer documentation"
      subtitle="Generate a shareable API reference for this workspace"
      actions={
        <Link href={`/admin/tenants/${tenantId}`}>
          <Button variant="secondary" size="sm" leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}>
            Back to tenant
          </Button>
        </Link>
      }
    >
      {tenant === null ? (
        <div className="py-6">
          <LoadingBlock label="Loading" />
        </div>
      ) : (
        <TenantDocsManager tenantId={tenantId} tenantName={tenant.name} />
      )}
    </AdminShell>
  );
}
