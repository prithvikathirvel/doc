"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import Link from "next/link";
import { ExternalLink, Settings } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, DescriptionList } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { HandoverDetails } from "@/components/tenants/HandoverDetails";
import { AnalyticsView } from "@/components/workspace/AnalyticsView";
import { tenantsApi } from "@/lib/api";
import { toast } from "sonner";
import type { Tenant, TenantStorageConfig } from "@/lib/types";
import { formatBytes, formatDate, providerLabel } from "@/lib/utils";

export default function AdminTenantOverviewPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = use(params);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [storage, setStorage] = useState<TenantStorageConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    void tenantsApi
      .get(tenantId)
      .then((result) => {
        if (cancelled) return;
        setTenant(result.tenant);
        setStorage(result.storage ?? null);
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load the tenant");
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const basePath = `/admin/tenants/${tenantId}`;

  return (
    <AdminShell
      tenantId={tenantId}
      title={tenant?.name || "Tenant"}
      subtitle="Account details, usage analytics and workspace contents"
      actions={
        <>
          <Link href={`${basePath}/documents`}>
            <Button variant="secondary" leftIcon={<ExternalLink className="h-3.5 w-3.5" />}>
              Open documents
            </Button>
          </Link>
          <Link href={`${basePath}/settings`}>
            <Button leftIcon={<Settings className="h-3.5 w-3.5" />}>Settings</Button>
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <Card>
          <CardHeader
            title="Customer handover details"
            description="Everything the customer needs to sign in to their workspace."
            action={tenant ? <StatusBadge status={tenant.status} /> : undefined}
          />
          {tenant && (
            <HandoverDetails
              tenant={tenant}
              storage={storage ? { provider: storage.provider, container: storage.container } : null}
            />
          )}

          <div className="mt-5 border-t border-[var(--border)] pt-4">
            <DescriptionList
              columns={3}
              items={[
                { label: "Organisation", value: tenant?.name || "—" },
                { label: "Owner", value: tenant?.ownerName || "Not set" },
                { label: "Created", value: tenant ? formatDate(tenant.createdAt) : "—" },
                {
                  label: "Maximum file size",
                  value: tenant ? formatBytes(tenant.maxFileSizeBytes) : "—",
                },
                {
                  label: "Storage target",
                  value: storage
                    ? `${providerLabel(storage.provider)} · ${storage.container}`
                    : "Not configured",
                },
                {
                  label: "Allowed file types",
                  value: tenant?.allowedMimeTypes?.length ? (
                    <span className="flex flex-wrap gap-1">
                      {tenant.allowedMimeTypes.map((type) => (
                        <Badge key={type}>{type}</Badge>
                      ))}
                    </span>
                  ) : (
                    "All types allowed"
                  ),
                  full: true,
                },
              ]}
            />
          </div>
        </Card>

        <AnalyticsView tenantId={tenantId} basePath={basePath} tenant={tenant} storage={storage} />
      </div>
    </AdminShell>
  );
}
