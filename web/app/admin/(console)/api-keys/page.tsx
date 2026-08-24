"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { CopyButton } from "@/components/ui/Copy";
import { EmptyState } from "@/components/ui/Feedback";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { directoryApi, tenantsApi } from "@/lib/api";
import type { ApiKeyRecord, CreatedApiKey, Tenant } from "@/lib/types";
import { formatRelative } from "@/lib/utils";

/**
 * Machine-client credentials. Keys are shown exactly once; only a SHA-256
 * hash is stored server-side. A key carries its own workspace scope and role.
 */
export default function ApiKeysPage() {
  const [loading, setLoading] = useState(true);
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [keyResult, tenantResult] = await Promise.all([
        directoryApi.listApiKeys(),
        tenantsApi.list().catch(() => ({ tenants: [] as Tenant[] })),
      ]);
      setKeys(keyResult.apiKeys || []);
      setTenants(tenantResult.tenants || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tenantName = useCallback(
    (tenantId: string | null) =>
      tenantId ? tenants.find((tenant) => tenant.id === tenantId)?.name || tenantId.slice(0, 8) : "Whole platform",
    [tenants]
  );

  const toggle = async (key: ApiKeyRecord) => {
    const status = key.status === "active" ? "disabled" : "active";
    try {
      await directoryApi.updateApiKey(key.id, status);
      toast.success(`Key ${status}`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the key");
    }
  };

  const remove = async (key: ApiKeyRecord) => {
    if (!window.confirm(`Delete the key "${key.displayName}"? Clients using it stop working immediately.`)) return;
    try {
      await directoryApi.deleteApiKey(key.id);
      toast.success("Key deleted");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the key");
    }
  };

  const columns: Array<Column<ApiKeyRecord>> = useMemo(
    () => [
      {
        key: "name",
        header: "Key",
        sortValue: (key) => key.displayName,
        cell: (key) => (
          <div className="min-w-0">
            <span className="block truncate font-medium text-[var(--text)]">{key.displayName}</span>
            <span className="block truncate text-[11.5px] text-[var(--text-muted)]">dms_{key.keyPrefix}…</span>
          </div>
        ),
      },
      {
        key: "scope",
        header: "Scope",
        sortValue: (key) => tenantName(key.tenantId),
        cell: (key) => (
          <div className="min-w-0">
            <span className="block truncate text-[12.5px] text-[var(--text)]">{tenantName(key.tenantId)}</span>
            <span className="block text-[11.5px] text-[var(--text-muted)]">{key.roles.join(", ")}</span>
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        sortValue: (key) => key.status,
        cell: (key) =>
          key.status === "active" ? (
            <Badge tone="success" dot>
              Active
            </Badge>
          ) : (
            <Badge tone="danger" dot>
              Disabled
            </Badge>
          ),
      },
      {
        key: "usage",
        header: "Last used",
        hideBelow: "md",
        sortValue: (key) => key.lastUsedAt || "",
        cell: (key) => (
          <span className="text-[12.5px] text-[var(--text-secondary)]">
            {key.lastUsedAt ? formatRelative(key.lastUsedAt) : "never"}
          </span>
        ),
      },
      {
        key: "actions",
        header: "",
        align: "right",
        width: "180px",
        cell: (key) => (
          <div className="flex items-center justify-end gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => void toggle(key)}>
              {key.status === "active" ? "Disable" : "Enable"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void remove(key)}>
              Delete
            </Button>
          </div>
        ),
      },
    ],
    [tenantName]
  );

  return (
    <div className="animate-rise space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--text)]">API keys</h1>
          <p className="mt-1 max-w-[560px] text-[13px] leading-relaxed text-[var(--text-secondary)]">
            Credentials for machine clients consuming the DMS API. A key carries its own
            workspace scope and role; send it as the <code className="rounded bg-[var(--surface-muted)] px-1">x-api-key</code> header.
            The full key is shown only once at creation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void load()} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} leftIcon={<Plus className="h-3.5 w-3.5" />}>
            New API key
          </Button>
        </div>
      </div>

      <DataTable
        data={keys}
        columns={columns}
        getRowId={(key) => key.id}
        loading={loading}
        loadingLabel="Loading API keys"
        caption="API keys for machine clients"
        defaultSort={{ key: "name", direction: "asc" }}
        empty={
          <EmptyState
            icon={<KeyRound className="h-4 w-4" />}
            title="No API keys yet"
            description="Create one for every integration that uploads or reads documents without a signed-in user."
          />
        }
      />

      {createOpen && (
        <CreateKeyDialog
          tenants={tenants}
          onClose={() => setCreateOpen(false)}
          onCreated={async (result) => {
            setCreateOpen(false);
            setCreated(result);
            await load();
          }}
        />
      )}

      {created && <CreatedKeyDialog result={created} onClose={() => setCreated(null)} />}
    </div>
  );
}

function CreateKeyDialog({
  tenants,
  onClose,
  onCreated,
}: {
  tenants: Tenant[];
  onClose: () => void;
  onCreated: (result: CreatedApiKey) => void | Promise<void>;
}) {
  const [displayName, setDisplayName] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [role, setRole] = useState("member");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const result = await directoryApi.createApiKey({
        displayName: displayName.trim(),
        tenantId: tenantId || null,
        roles: [role],
      });
      await onCreated(result);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not create the key");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="New API key"
      description="Give the integration the narrowest scope that works: one workspace and the member role."
      icon={<KeyRound className="h-4 w-4" />}
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="acme import worker"
          error={error}
          required
          autoFocus
        />
        <div>
          <label className="text-[12.5px] font-medium text-[var(--text-secondary)]" htmlFor="key-tenant">
            Workspace scope
          </label>
          <select
            id="key-tenant"
            value={tenantId}
            onChange={(event) => setTenantId(event.target.value)}
            className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)]"
          >
            <option value="">Whole platform (platform_admin only)</option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[12.5px] font-medium text-[var(--text-secondary)]" htmlFor="key-role">
            Role
          </label>
          <select
            id="key-role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)]"
          >
            <option value="member">member — own documents only</option>
            <option value="tenant_admin">tenant_admin — everything in the workspace</option>
            {!tenantId && <option value="platform_admin">platform_admin — cross-workspace</option>}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Create key
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CreatedKeyDialog({ result, onClose }: { result: CreatedApiKey; onClose: () => void }) {
  return (
    <Dialog
      open
      onClose={onClose}
      title="Copy your API key now"
      description="This is the only time the full key is shown. Store it in your secret manager."
      icon={<KeyRound className="h-4 w-4" />}
      dismissible={false}
    >
      <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5">
        <code className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--text)]">{result.key}</code>
        <CopyButton value={result.key} label="Copy the key" />
      </div>
      <p className="mt-3 text-[12px] text-[var(--text-secondary)]">
        Send it as the <code className="rounded bg-[var(--surface-muted)] px-1">x-api-key</code> header on
        every request. Scope: {result.apiKey.tenantId ? "one workspace" : "whole platform"} · role:{" "}
        {result.apiKey.roles.join(", ")}.
      </p>
      <div className="mt-4 flex justify-end">
        <Button onClick={onClose}>I stored it safely</Button>
      </div>
    </Dialog>
  );
}
