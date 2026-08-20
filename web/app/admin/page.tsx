"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/AdminShell";
import { Button } from "@/components/ui/Button";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/Feedback";
import { StatCard } from "@/components/ui/Analytics";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { OnboardingWizard } from "@/components/tenants/OnboardingWizard";
import { tenantsApi } from "@/lib/api";
import type { Tenant } from "@/lib/types";
import { formatBytes, formatDate, formatNumber } from "@/lib/utils";

export default function AdminTenantsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [search, setSearch] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await tenantsApi.list();
      setTenants(result.tenants || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load tenants");
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tenants;
    return tenants.filter((tenant) =>
      [tenant.name, tenant.slug, tenant.id, tenant.ownerEmail || ""].some((value) =>
        value.toLowerCase().includes(term)
      )
    );
  }, [tenants, search]);

  const activeCount = tenants.filter((tenant) => tenant.status === "active").length;
  const newest = useMemo(
    () =>
      [...tenants].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0],
    [tenants]
  );

  const columns: Array<Column<Tenant>> = [
    {
      key: "name",
      header: "Tenant",
      sortValue: (tenant) => tenant.name,
      cell: (tenant) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]">
            <Building2 className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-[var(--text)]">{tenant.name}</span>
            <span className="block truncate font-mono text-[11.5px] text-[var(--text-muted)]">
              {tenant.slug}
            </span>
          </span>
        </div>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      hideBelow: "md",
      sortValue: (tenant) => tenant.ownerEmail || "",
      cell: (tenant) => (
        <span className="block min-w-0 truncate text-[12.5px] text-[var(--text-secondary)]">
          {tenant.ownerEmail || <span className="text-[var(--text-muted)]">Not set</span>}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (tenant) => tenant.status,
      cell: (tenant) => <StatusBadge status={tenant.status} />,
    },
    {
      key: "limit",
      header: "Max file size",
      hideBelow: "lg",
      align: "right",
      sortValue: (tenant) => tenant.maxFileSizeBytes,
      cell: (tenant) => (
        <span className="text-[12.5px] text-[var(--text-secondary)]">
          {formatBytes(tenant.maxFileSizeBytes)}
        </span>
      ),
    },
    {
      key: "types",
      header: "File types",
      hideBelow: "xl",
      sortValue: (tenant) => tenant.allowedMimeTypes?.length ?? 0,
      cell: (tenant) => (
        <Badge tone="neutral">
          {tenant.allowedMimeTypes?.length ? `${tenant.allowedMimeTypes.length} allowed` : "All types"}
        </Badge>
      ),
    },
    {
      key: "createdAt",
      header: "Onboarded",
      hideBelow: "lg",
      sortValue: (tenant) => new Date(tenant.createdAt).getTime(),
      cell: (tenant) => (
        <span className="whitespace-nowrap text-[12.5px] text-[var(--text-muted)]">
          {formatDate(tenant.createdAt)}
        </span>
      ),
    },
    {
      key: "open",
      header: "",
      align: "right",
      width: "48px",
      cell: () => <ChevronRight className="ml-auto h-4 w-4 text-[var(--text-muted)]" />,
    },
  ];

  return (
    <AdminShell
      title="Tenant onboarding"
      subtitle="Create customer workspaces and attach their storage"
      actions={
        <>
          <Button variant="secondary" onClick={() => void load()} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button onClick={() => setWizardOpen(true)} leftIcon={<Plus className="h-3.5 w-3.5" />}>
            Onboard tenant
          </Button>
        </>
      }
    >
      <div className="space-y-4 animate-rise">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Tenants"
            value={formatNumber(tenants.length)}
            hint="Workspaces on this platform"
            icon={<Building2 className="h-4 w-4" />}
            loading={loading}
          />
          <StatCard
            label="Active"
            value={formatNumber(activeCount)}
            hint={`${formatNumber(tenants.length - activeCount)} suspended`}
            loading={loading}
          />
          <StatCard
            label="Newest workspace"
            value={newest ? newest.name : "—"}
            hint={newest ? formatDate(newest.createdAt) : "No tenants yet"}
            loading={loading}
          />
        </div>

        <DataTable
          data={filtered}
          columns={columns}
          getRowId={(tenant) => tenant.id}
          onRowClick={(tenant) => router.push(`/admin/tenants/${tenant.id}`)}
          defaultSort={{ key: "createdAt", direction: "desc" }}
          loading={loading}
          loadingLabel="Loading tenants"
          caption="Tenants on this platform"
          toolbar={
            <>
              <div className="w-full sm:max-w-xs">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, workspace ID or owner"
                  leftIcon={<Search className="h-4 w-4" />}
                  aria-label="Search tenants"
                />
              </div>
              <p className="text-[12px] text-[var(--text-muted)]">
                {formatNumber(filtered.length)} of {formatNumber(tenants.length)} shown
              </p>
            </>
          }
          empty={
            <EmptyState
              icon={<Building2 className="h-4 w-4" />}
              title={tenants.length === 0 ? "No tenants yet" : "No matching tenants"}
              description={
                tenants.length === 0
                  ? "Onboard your first customer to create their isolated document workspace."
                  : "Try a different search term."
              }
              action={
                tenants.length === 0 ? (
                  <Button size="sm" onClick={() => setWizardOpen(true)}>
                    Onboard tenant
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </div>

      <OnboardingWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={() => void load()}
      />
    </AdminShell>
  );
}
