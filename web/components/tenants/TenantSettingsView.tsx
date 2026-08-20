"use client";

import { useCallback, useEffect, useState } from "react";
import { HardDrive, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { LoadingBlock } from "@/components/ui/Feedback";
import { HandoverDetails } from "./HandoverDetails";
import { SessionHeadersCard } from "@/components/auth/SessionHeadersCard";
import { StorageConfigFields, type StorageErrors } from "./StorageConfigFields";
import { tenantsApi } from "@/lib/api";
import type { ProviderType, Tenant, TenantStorageConfig } from "@/lib/types";
import {
  buildStoragePayload,
  emptyStorageForm,
  formatBytes,
  formatDate,
  providerLabel,
  validateStorageForm,
  type StorageFormValues,
} from "@/lib/utils";

const SIZE_OPTIONS = [
  { value: String(10 * 1024 * 1024), label: "10 MB" },
  { value: String(25 * 1024 * 1024), label: "25 MB" },
  { value: String(50 * 1024 * 1024), label: "50 MB" },
  { value: String(100 * 1024 * 1024), label: "100 MB" },
  { value: String(512 * 1024 * 1024), label: "512 MB" },
  { value: String(1024 * 1024 * 1024), label: "1 GB" },
];

function toFormValues(config: TenantStorageConfig | null): StorageFormValues {
  if (!config) return { ...emptyStorageForm };
  return {
    container: config.container || "",
    region: config.region || "",
    endpoint: config.endpoint || "",
    accessKeyRef: config.accessKeyRef || "",
    secretKeyRef: config.secretKeyRef || "",
    sessionTokenRef: config.sessionTokenRef || "",
    projectId: config.projectId || "",
    accountName: config.accountName || "",
    credentialsJsonRef: config.credentialsJsonRef || "",
    basePrefix: config.basePrefix || "",
    useSsl: config.useSsl,
    signedUrlTtlSeconds: config.signedUrlTtlSeconds || 900,
  };
}

/**
 * Tenant profile, limits and storage target.
 * `canEditProfile` is reserved for platform administrators; tenant administrators
 * can still manage their own storage configuration.
 */
export function TenantSettingsView({
  tenantId,
  canEditProfile,
  canEditStorage = true,
  onUpdated,
}: {
  tenantId: string;
  canEditProfile: boolean;
  canEditStorage?: boolean;
  onUpdated?: (tenant: Tenant) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [storageConfig, setStorageConfig] = useState<TenantStorageConfig | null>(null);

  const [profile, setProfile] = useState({
    name: "",
    ownerName: "",
    ownerEmail: "",
    status: "active",
    maxFileSizeBytes: String(50 * 1024 * 1024),
    allowedMimeTypes: "",
  });
  const [provider, setProvider] = useState<ProviderType>("s3");
  const [storage, setStorage] = useState<StorageFormValues>({ ...emptyStorageForm });
  const [storageErrors, setStorageErrors] = useState<StorageErrors>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingStorage, setSavingStorage] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await tenantsApi.get(tenantId);
      setTenant(result.tenant);
      setStorageConfig(result.storage ?? null);
      setProfile({
        name: result.tenant.name,
        ownerName: result.tenant.ownerName || "",
        ownerEmail: result.tenant.ownerEmail || "",
        status: result.tenant.status,
        maxFileSizeBytes: String(result.tenant.maxFileSizeBytes),
        allowedMimeTypes: (result.tenant.allowedMimeTypes || []).join(", "),
      });
      if (result.storage) {
        setProvider(result.storage.provider);
        setStorage(toFormValues(result.storage));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load tenant settings");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const types = profile.allowedMimeTypes
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const result = await tenantsApi.update(tenantId, {
        name: profile.name.trim(),
        ownerName: profile.ownerName.trim() || null,
        ownerEmail: profile.ownerEmail.trim() || null,
        status: profile.status as "active" | "suspended",
        maxFileSizeBytes: Number(profile.maxFileSizeBytes),
        allowedMimeTypes: types.length ? types : null,
      });
      setTenant(result.tenant);
      onUpdated?.(result.tenant);
      toast.success("Tenant updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    } finally {
      setSavingProfile(false);
    }
  };

  const saveStorage = async () => {
    const errors = validateStorageForm(provider, storage);
    setStorageErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error("Fix the highlighted fields");
      return;
    }
    setSavingStorage(true);
    try {
      const result = await tenantsApi.saveStorage(
        tenantId,
        buildStoragePayload(provider, storage)
      );
      setStorageConfig(result.storage);
      toast.success("Storage configuration saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the storage configuration");
    } finally {
      setSavingStorage(false);
    }
  };

  if (loading) return <LoadingBlock label="Loading settings" />;
  if (!tenant) return null;

  return (
    <div className="space-y-4 animate-rise">
      <Card>
        <CardHeader
          title="Workspace identity"
          description="Details the customer needs to connect to this workspace."
        />
        <HandoverDetails
          tenant={tenant}
          storage={storageConfig ? { provider: storageConfig.provider, container: storageConfig.container } : null}
        />
      </Card>

      <Card>
        <CardHeader
          title="Profile and limits"
          description={
            canEditProfile
              ? "Applies to every upload in this tenant."
              : "Managed by your platform administrator."
          }
          action={
            canEditProfile ? (
              <Button
                size="sm"
                loading={savingProfile}
                onClick={() => void saveProfile()}
                leftIcon={<Save className="h-3.5 w-3.5" />}
              >
                Save changes
              </Button>
            ) : undefined
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Organisation name"
            value={profile.name}
            onChange={(event) => setProfile({ ...profile, name: event.target.value })}
            disabled={!canEditProfile}
          />
          <Select
            label="Status"
            value={profile.status}
            onChange={(event) => setProfile({ ...profile, status: event.target.value })}
            options={[
              { value: "active", label: "Active" },
              { value: "suspended", label: "Suspended" },
            ]}
            disabled={!canEditProfile}
            hint={profile.status === "suspended" ? "Suspended tenants cannot upload or download." : undefined}
          />
          <Input
            label="Owner name"
            value={profile.ownerName}
            onChange={(event) => setProfile({ ...profile, ownerName: event.target.value })}
            disabled={!canEditProfile}
          />
          <Input
            label="Owner email"
            type="email"
            value={profile.ownerEmail}
            onChange={(event) => setProfile({ ...profile, ownerEmail: event.target.value })}
            disabled={!canEditProfile}
            hint="Signs in as the workspace administrator."
          />
          <Select
            label="Maximum file size"
            value={profile.maxFileSizeBytes}
            onChange={(event) => setProfile({ ...profile, maxFileSizeBytes: event.target.value })}
            options={
              SIZE_OPTIONS.some((option) => option.value === profile.maxFileSizeBytes)
                ? SIZE_OPTIONS
                : [
                    { value: profile.maxFileSizeBytes, label: formatBytes(Number(profile.maxFileSizeBytes)) },
                    ...SIZE_OPTIONS,
                  ]
            }
            disabled={!canEditProfile}
          />
          <Input
            label="Allowed MIME types"
            value={profile.allowedMimeTypes}
            onChange={(event) => setProfile({ ...profile, allowedMimeTypes: event.target.value })}
            placeholder="Leave empty to allow every type"
            disabled={!canEditProfile}
            hint="Comma separated, for example application/pdf, image/png"
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Storage configuration"
          description="Where this tenant's documents are stored. Only the selected provider's fields are saved."
          action={
            <div className="flex items-center gap-2">
              {storageConfig ? (
                <Badge tone="success" dot>
                  {providerLabel(storageConfig.provider)}
                </Badge>
              ) : (
                <Badge tone="warning" dot>
                  Not configured
                </Badge>
              )}
              {canEditStorage && (
                <Button
                  size="sm"
                  loading={savingStorage}
                  onClick={() => void saveStorage()}
                  leftIcon={<HardDrive className="h-3.5 w-3.5" />}
                >
                  Save storage
                </Button>
              )}
            </div>
          }
        />
        {canEditStorage ? (
          <>
            <StorageConfigFields
              provider={provider}
              onProviderChange={(next) => {
                setProvider(next);
                setStorageErrors({});
                setStorage((current) =>
                  next === storageConfig?.provider
                    ? toFormValues(storageConfig)
                    : {
                        ...emptyStorageForm,
                        container: current.container,
                        basePrefix: current.basePrefix,
                        signedUrlTtlSeconds: current.signedUrlTtlSeconds,
                      }
                );
              }}
              values={storage}
              onChange={setStorage}
              errors={storageErrors}
            />
            {storageConfig && (
              <p className="mt-4 text-[11.5px] text-[var(--text-muted)]">
                Last updated {formatDate(storageConfig.updatedAt)}. Existing documents keep their original
                location when the provider changes.
              </p>
            )}
          </>
        ) : storageConfig ? (
          <dl className="grid gap-3 sm:grid-cols-2">
            <SummaryRow label="Provider" value={providerLabel(storageConfig.provider)} />
            <SummaryRow label="Bucket or container" value={storageConfig.container} />
            {storageConfig.region && <SummaryRow label="Region" value={storageConfig.region} />}
            {storageConfig.basePrefix && <SummaryRow label="Prefix" value={storageConfig.basePrefix} />}
            <SummaryRow
              label="Signed URL lifetime"
              value={`${storageConfig.signedUrlTtlSeconds} seconds`}
            />
          </dl>
        ) : (
          <p className="text-[12.5px] text-[var(--text-secondary)]">
            No storage has been attached to this workspace yet.
          </p>
        )}
      </Card>

      <SessionHeadersCard tenantId={tenantId} />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-0.5 truncate text-[12.5px] text-[var(--text)]">{value}</dd>
    </div>
  );
}
