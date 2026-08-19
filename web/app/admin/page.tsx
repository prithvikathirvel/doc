"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, ChevronRight, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/AdminShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { StatCard } from "@/components/ui/Analytics";
import { OnboardingWizard } from "@/components/tenants/OnboardingWizard";
import { tenantsApi } from "@/lib/api";
import type { Tenant } from "@/lib/types";
import { formatBytes, formatDate, formatNumber } from "@/lib/utils";

export default function AdminTenantsPage() {
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
            value={
              tenants.length
                ? [...tenants].sort(
                    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                  )[0].name
                : "—"
            }
            hint={
              tenants.length
                ? formatDate(
                    [...tenants].sort(
                      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                    )[0].createdAt
                  )
                : "No tenants yet"
            }
            loading={loading}
          />
        </div>

        <div className="w-full sm:max-w-xs">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, URL or ID"
            leftIcon={<Search className="h-4 w-4" />}
            aria-label="Search tenants"
          />
        </div>

        <Card padded={false}>
          {loading ? (
            <LoadingBlock label="Loading tenants" />
          ) : filtered.length === 0 ? (
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
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {filtered.map((tenant) => (
                <li key={tenant.id}>
                  <Link
                    href={`/admin/tenants/${tenant.id}`}
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--surface-muted)]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]">
                      <Building2 className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-[13.5px] font-medium text-[var(--text)]">
                          {tenant.name}
                        </p>
                        <StatusBadge status={tenant.status} />
                      </div>
                      <p className="mt-0.5 truncate text-[12px] text-[var(--text-secondary)]">
                        <span className="font-mono">{tenant.slug}</span>
                        {tenant.ownerEmail ? ` · ${tenant.ownerEmail}` : ""}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-muted)]">
                        {tenant.id}
                      </p>
                    </div>
                    <div className="hidden shrink-0 items-center gap-2 md:flex">
                      <Badge tone="neutral">Max {formatBytes(tenant.maxFileSizeBytes)}</Badge>
                      <Badge tone="neutral">
                        {tenant.allowedMimeTypes?.length
                          ? `${tenant.allowedMimeTypes.length} file types`
                          : "All file types"}
                      </Badge>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <OnboardingWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={() => void load()}
      />
    </AdminShell>
  );
}
