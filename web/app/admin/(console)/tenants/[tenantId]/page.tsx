"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import Link from "next/link";
import { Building2, ExternalLink, Fingerprint, KeyRound, Mail, Settings } from "lucide-react";
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
import { cn, formatBytes, formatDate, providerLabel } from "@/lib/utils";

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
        {/* Professional identity summary: internal slug is intentionally omitted
            because customers sign in with the tenant ID. */}
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex min-w-0 items-center gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <Building2 className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-[16px] font-semibold tracking-[-0.01em] text-[var(--text)]">
                    {tenant?.name || "Tenant"}
                  </h2>
                  {tenant && <StatusBadge status={tenant.status} />}
                </div>
                <p className="mt-0.5 truncate text-[12.5px] text-[var(--text-secondary)]">
                  Customer workspace account and sign-in details
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {storage && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1.5 text-[12px] text-[var(--text-secondary)]">
                  <ProviderMark provider={storage.provider} size="sm" />
                  <span className="max-w-[180px] truncate">{storage.container}</span>
                </span>
              )}
              <Button size="sm" variant="secondary" onClick={() => setHandoverOpen(true)}>
                View handover details
              </Button>
            </div>
          </div>

          <div className="grid gap-px border-t border-[var(--border)] bg-[var(--border)] sm:grid-cols-2">
            <IdentityItem
              icon={<Mail className="h-4 w-4" />}
              label="Owner"
              value={tenant?.ownerEmail || "Not set"}
            />
            <IdentityItem
              icon={<Fingerprint className="h-4 w-4" />}
              label="Tenant ID"
              value={tenant?.id || "—"}
              mono
              copy={Boolean(tenant?.id)}
            />
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
  icon,
  mono,
  copy,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  mono?: boolean;
  copy?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 bg-white px-4 py-3.5 sm:px-5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          {label}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span
            className={cn(
              "min-w-0 truncate text-[13px] text-[var(--text)]",
              mono && "font-mono text-[12px]"
            )}
            title={value}
          >
            {value}
          </span>
          {copy && value !== "—" && value !== "Not set" && (
            <CopyButton value={value} className="h-6 w-6 shrink-0" />
          )}
        </div>
      </div>
    </div>
  );
}
