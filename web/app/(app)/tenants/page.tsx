"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, HardDrive, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Select } from "@/components/ui/Input";
import { InlineLoader } from "@/components/ui/Loader";
import { EmptyState } from "@/components/ui/EmptyState";
import { tenantsApi } from "@/lib/api";
import type { Tenant, TenantStorageConfig } from "@/lib/types";
import { formatBytes, providerLabel } from "@/lib/utils";
import { useSession } from "@/contexts/SessionContext";

const emptyStorage = {
  provider: "minio",
  container: "documents",
  region: "us-east-1",
  endpoint: "http://127.0.0.1:9000",
  accessKeyRef: "MINIO_ACCESS_KEY",
  secretKeyRef: "MINIO_SECRET_KEY",
  sessionTokenRef: "",
  projectId: "",
  accountName: "",
  credentialsJsonRef: "",
  basePrefix: "dms",
  useSsl: false,
  signedUrlTtlSeconds: 900,
};

export default function TenantsPage() {
  const { isAdmin, session, setSession, refreshTenant } = useSession();
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [storageTenant, setStorageTenant] = useState<Tenant | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    maxFileSizeBytes: "52428800",
    allowedMimeTypes: "application/pdf,text/plain,image/png,image/jpeg",
  });
  const [storageForm, setStorageForm] = useState(emptyStorage);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await tenantsApi.list();
      setTenants(res.tenants || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to list tenants");
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, session.userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitCreate = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setBusy(true);
    try {
      const mimes = form.allowedMimeTypes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await tenantsApi.create({
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        maxFileSizeBytes: form.maxFileSizeBytes ? Number(form.maxFileSizeBytes) : undefined,
        allowedMimeTypes: mimes.length ? mimes : null,
      });
      toast.success(`Tenant “${res.tenant.name}” created`);
      setCreateOpen(false);
      setForm({
        name: "",
        slug: "",
        maxFileSizeBytes: "52428800",
        allowedMimeTypes: "application/pdf,text/plain,image/png,image/jpeg",
      });
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const openStorage = async (t: Tenant) => {
    setStorageTenant(t);
    setStorageForm(emptyStorage);
    try {
      const res = await tenantsApi.get(t.id);
      const s = res.storage as TenantStorageConfig | null | undefined;
      if (s) {
        setStorageForm({
          provider: s.provider || "minio",
          container: s.container || "",
          region: s.region || "",
          endpoint: s.endpoint || "",
          accessKeyRef: s.accessKeyRef || "",
          secretKeyRef: s.secretKeyRef || "",
          sessionTokenRef: s.sessionTokenRef || "",
          projectId: s.projectId || "",
          accountName: s.accountName || "",
          credentialsJsonRef: s.credentialsJsonRef || "",
          basePrefix: s.basePrefix || "",
          useSsl: !!s.useSsl,
          signedUrlTtlSeconds: s.signedUrlTtlSeconds || 900,
        });
      }
    } catch {
      /* new config */
    }
  };

  const submitStorage = async () => {
    if (!storageTenant) return;
    if (!storageForm.container.trim()) {
      toast.error("Container / bucket is required");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        provider: storageForm.provider,
        container: storageForm.container.trim(),
        useSsl: storageForm.useSsl,
        signedUrlTtlSeconds: Number(storageForm.signedUrlTtlSeconds) || 900,
      };
      const optional = [
        "region",
        "endpoint",
        "accessKeyRef",
        "secretKeyRef",
        "sessionTokenRef",
        "projectId",
        "accountName",
        "credentialsJsonRef",
        "basePrefix",
      ] as const;
      for (const k of optional) {
        const v = storageForm[k];
        if (typeof v === "string" && v.trim()) body[k] = v.trim();
      }
      await tenantsApi.upsertStorage(storageTenant.id, body as never);
      toast.success("Storage configuration saved");
      setStorageTenant(null);
      if (storageTenant.id === session.tenantId) void refreshTenant();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Storage update failed");
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (t: Tenant) => {
    setSession({ ...session, tenantId: t.id });
    toast.success(`Switched to ${t.name}`);
    void refreshTenant();
  };

  if (!isAdmin) {
    return (
      <AppShell title="Tenants" subtitle="Platform administration">
        <Card className="mx-auto max-w-lg p-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-amber-100 bg-amber-50 text-amber-600">
            <Building2 className="h-4 w-4" />
          </div>
          <p className="text-sm font-semibold text-slate-800">Platform admin required</p>
          <p className="mt-1 text-[12.5px] text-slate-500">
            Switch your session role to <code className="font-mono">platform_admin</code> in Settings
            to manage tenants.
          </p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Tenants" subtitle="Onboard customers and attach storage providers">
      <div className="mx-auto max-w-5xl space-y-4 animate-fade-up">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-slate-500">
            Credentials are stored as <strong className="font-semibold text-slate-700">env-var references</strong>, never raw secrets.
          </p>
          <div className="flex gap-2">
            <Button variant="outlined" size="sm" leftIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void load()}>
              Refresh
            </Button>
            <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreateOpen(true)}>
              New tenant
            </Button>
          </div>
        </div>

        {loading ? (
          <InlineLoader />
        ) : tenants.length === 0 ? (
          <Card padding={false}>
            <EmptyState
              icon={<Building2 className="h-4 w-4" />}
              title="No tenants"
              description="Create a tenant, then attach S3 / MinIO / GCS / Azure."
              action={
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  New tenant
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-3">
            {tenants.map((t) => (
              <Card key={t.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-800">{t.name}</h3>
                        <StatusBadge status={t.status} />
                        {t.id === session.tenantId && <Badge tone="indigo">current</Badge>}
                      </div>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-400">{t.id}</p>
                      <p className="mt-1 text-[12px] text-slate-500">
                        slug <span className="font-medium text-slate-700">{t.slug}</span>
                        {" · "}
                        max {formatBytes(t.maxFileSizeBytes)}
                      </p>
                      {t.allowedMimeTypes && t.allowedMimeTypes.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {t.allowedMimeTypes.map((m) => (
                            <Badge key={m} tone="slate">
                              {m}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {t.id !== session.tenantId && (
                      <Button variant="outlined" size="sm" onClick={() => switchTo(t)}>
                        Switch to
                      </Button>
                    )}
                    <Button
                      variant="outlined"
                      size="sm"
                      leftIcon={<HardDrive className="h-3.5 w-3.5" />}
                      onClick={() => void openStorage(t)}
                    >
                      Storage
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create tenant"
        description="Platform admin onboarding"
        size="md"
        footer={
          <>
            <Button variant="outlined" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={() => void submitCreate()}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required placeholder="Acme Corp" />
          <Input label="Slug" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="acme (optional)" />
          <Input
            label="Max file size (bytes)"
            value={form.maxFileSizeBytes}
            onChange={(e) => setForm((f) => ({ ...f, maxFileSizeBytes: e.target.value }))}
          />
          <Input
            label="Allowed MIME types"
            value={form.allowedMimeTypes}
            onChange={(e) => setForm((f) => ({ ...f, allowedMimeTypes: e.target.value }))}
            hint="Comma-separated. Leave empty for no restriction if API allows."
          />
        </div>
      </Dialog>

      <Dialog
        open={!!storageTenant}
        onClose={() => setStorageTenant(null)}
        title="Storage configuration"
        description={
          storageTenant
            ? `Attach a provider to “${storageTenant.name}”. Use env-var names for secrets.`
            : undefined
        }
        size="lg"
        footer={
          <>
            <Button variant="outlined" size="sm" onClick={() => setStorageTenant(null)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={() => void submitStorage()}>
              Save storage
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Provider"
            value={storageForm.provider}
            onChange={(e) => {
              const provider = e.target.value;
              setStorageForm((f) => {
                const next = { ...f, provider };
                if (provider === "minio") {
                  return {
                    ...next,
                    endpoint: next.endpoint || "http://127.0.0.1:9000",
                    accessKeyRef: next.accessKeyRef || "MINIO_ACCESS_KEY",
                    secretKeyRef: next.secretKeyRef || "MINIO_SECRET_KEY",
                    useSsl: false,
                  };
                }
                return next;
              });
            }}
            options={[
              { value: "minio", label: providerLabel("minio") },
              { value: "s3", label: providerLabel("s3") },
              { value: "gcp", label: providerLabel("gcp") },
              { value: "azure", label: providerLabel("azure") },
            ]}
          />
          <Input
            label="Container / bucket"
            value={storageForm.container}
            onChange={(e) => setStorageForm((f) => ({ ...f, container: e.target.value }))}
            required
          />
          <Input label="Region" value={storageForm.region} onChange={(e) => setStorageForm((f) => ({ ...f, region: e.target.value }))} />
          <Input label="Endpoint" value={storageForm.endpoint} onChange={(e) => setStorageForm((f) => ({ ...f, endpoint: e.target.value }))} hint="Required for MinIO" />
          <Input label="Access key ref" value={storageForm.accessKeyRef} onChange={(e) => setStorageForm((f) => ({ ...f, accessKeyRef: e.target.value }))} placeholder="MINIO_ACCESS_KEY" className="font-mono text-[12.5px]" />
          <Input label="Secret key ref" value={storageForm.secretKeyRef} onChange={(e) => setStorageForm((f) => ({ ...f, secretKeyRef: e.target.value }))} placeholder="MINIO_SECRET_KEY" className="font-mono text-[12.5px]" />
          <Input label="Project ID (GCP)" value={storageForm.projectId} onChange={(e) => setStorageForm((f) => ({ ...f, projectId: e.target.value }))} />
          <Input label="Credentials JSON ref (GCP)" value={storageForm.credentialsJsonRef} onChange={(e) => setStorageForm((f) => ({ ...f, credentialsJsonRef: e.target.value }))} className="font-mono text-[12.5px]" />
          <Input label="Account name (Azure)" value={storageForm.accountName} onChange={(e) => setStorageForm((f) => ({ ...f, accountName: e.target.value }))} />
          <Input label="Base prefix" value={storageForm.basePrefix} onChange={(e) => setStorageForm((f) => ({ ...f, basePrefix: e.target.value }))} />
          <Input
            label="Signed URL TTL (seconds)"
            type="number"
            value={String(storageForm.signedUrlTtlSeconds)}
            onChange={(e) =>
              setStorageForm((f) => ({ ...f, signedUrlTtlSeconds: Number(e.target.value) || 900 }))
            }
          />
          <label className="flex items-center gap-2 self-end rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700">
            <input
              type="checkbox"
              checked={storageForm.useSsl}
              onChange={(e) => setStorageForm((f) => ({ ...f, useSsl: e.target.checked }))}
            />
            Use SSL
          </label>
        </div>
        <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2.5 text-[11.5px] leading-relaxed text-indigo-800">
          Put real secrets in the API process environment (e.g. <code className="font-mono">MINIO_ACCESS_KEY</code>), then
          reference those names here. Restart the API after changing env vars.
        </div>
      </Dialog>
    </AppShell>
  );
}
