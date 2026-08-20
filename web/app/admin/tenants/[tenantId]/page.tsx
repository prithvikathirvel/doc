"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import Link from "next/link";
import { ExternalLink, KeyRound, Settings } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/AdminShell";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, DescriptionList } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { CopyButton } from "@/components/ui/Copy";
import { HandoverDetails } from "@/components/tenants/HandoverDetails";
import { ProviderMark } from "@/components/tenants/ProviderMark";
import { AnalyticsView } from "@/components/workspace/AnalyticsView";
import { tenantsApi } from "@/lib/api";
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
  const [handoverOpen, setHandoverOpen] = useState(false);

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
      subtitle="Usage analytics and account details"
      actions={
        <>
          <Button
            variant="secondary"
            onClick={() => setHandoverOpen(true)}
            leftIcon={<KeyRound className="h-3.5 w-3.5" />}
          >
            Handover details
          </Button>
          <Link href={`${basePath}/documents`}>
            <Button variant="secondary" leftIcon={<ExternalLink className="h-3.5 w-3.5" />}>
              <span className="hidden sm:inline">Open files</span>
            </Button>
          </Link>
          <Link href={`${basePath}/settings`}>
            <Button leftIcon={<Settings className="h-3.5 w-3.5" />}>Settings</Button>
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        {/* Compact identity strip: the values a customer asks for stay one click away
            without pushing the analytics below the fold. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 shadow-[var(--shadow-xs)]">
          <IdentityItem label="Workspace ID" value={tenant?.slug || "—"} mono />
          <IdentityItem label="Owner" value={tenant?.ownerEmail || "Not set"} />
          <IdentityItem label="Tenant ID" value={tenant?.id || "—"} mono truncate />
          <div className="ml-auto flex items-center gap-2">
            {storage && (
              <span className="hidden items-center gap-1.5 text-[12px] text-[var(--text-secondary)] sm:flex">
                <ProviderMark provider={storage.provider} size="sm" />
                {storage.container}
              </span>
            )}
            {tenant && <StatusBadge status={tenant.status} />}
            <Button size="sm" variant="ghost" onClick={() => setHandoverOpen(true)}>
              View handover details
            </Button>
          </div>
        </div>

        <AnalyticsView tenantId={tenantId} basePath={basePath} storage={storage} />
      </div>

      <Dialog
        open={handoverOpen}
        onClose={() => setHandoverOpen(false)}
        size="lg"
        title="Customer handover details"
        description="Everything the customer needs to sign in to their workspace."
        footer={
          <>
            <Link href={`${basePath}/settings`}>
              <Button variant="secondary" size="sm">
                Open settings
              </Button>
            </Link>
            <Button size="sm" onClick={() => setHandoverOpen(false)}>
              Done
            </Button>
          </>
        }
      >
        {tenant && (
          <div className="space-y-4">
            <HandoverDetails
              tenant={tenant}
              storage={storage ? { provider: storage.provider, container: storage.container } : null}
            />

            <Card padded={false} className="shadow-none">
              <div className="p-4">
                <CardHeader title="Account" className="mb-3" />
                <DescriptionList
                  columns={2}
                  items={[
                    { label: "Organisation", value: tenant.name },
                    { label: "Owner name", value: tenant.ownerName || "Not set" },
                    { label: "Created", value: formatDate(tenant.createdAt) },
                    { label: "Maximum file size", value: formatBytes(tenant.maxFileSizeBytes) },
                    {
                      label: "Storage target",
                      value: storage
                        ? `${providerLabel(storage.provider)} · ${storage.container}`
                        : "Not configured",
                    },
                    {
                      label: "Allowed file types",
                      value: tenant.allowedMimeTypes?.length ? (
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
          </div>
        )}
      </Dialog>
    </AdminShell>
  );
}

function IdentityItem({
  label,
  value,
  mono,
  truncate,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className={truncate ? "min-w-0 max-w-[260px]" : "min-w-0"}>
      <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </p>
      <div className="flex items-center gap-1">
        <span
          className={`truncate text-[12.5px] text-[var(--text)] ${mono ? "font-mono text-[12px]" : ""}`}
          title={value}
        >
          {value}
        </span>
        {value !== "—" && value !== "Not set" && <CopyButton value={value} className="h-5 w-5" />}
      </div>
    </div>
  );
}
