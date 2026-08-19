"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useSession } from "@/contexts/SessionContext";
import { DEFAULT_SESSION } from "@/lib/session";

export default function SettingsPage() {
  const { session, setSession, tenant, storage, refreshTenant } = useSession();
  const [form, setForm] = useState({
    tenantId: session.tenantId,
    userId: session.userId,
    userName: session.userName,
    roles: session.roles.join(", "),
  });

  const save = () => {
    const roles = form.roles
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    if (!form.tenantId.trim() || !form.userId.trim()) {
      toast.error("Tenant ID and User ID are required");
      return;
    }
    setSession({
      tenantId: form.tenantId.trim(),
      userId: form.userId.trim(),
      userName: form.userName.trim() || form.userId.trim(),
      roles: roles.length ? roles : ["user"],
    });
    toast.success("Session updated");
    void refreshTenant();
  };

  const resetDemo = () => {
    setForm({
      tenantId: DEFAULT_SESSION.tenantId,
      userId: DEFAULT_SESSION.userId,
      userName: DEFAULT_SESSION.userName,
      roles: DEFAULT_SESSION.roles.join(", "),
    });
    setSession(DEFAULT_SESSION);
    toast.success("Restored demo identity");
    void refreshTenant();
  };

  return (
    <AppShell title="Settings" subtitle="Session identity and tenant context">
      <div className="mx-auto grid max-w-4xl gap-4 lg:grid-cols-5 animate-fade-up">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Identity headers"
            description="Sent on every API request when AUTH_DISABLED=true"
          />
          <div className="space-y-3">
            <Input
              label="Tenant ID"
              value={form.tenantId}
              onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value }))}
              className="font-mono text-[12.5px]"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="User ID"
                value={form.userId}
                onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
              />
              <Input
                label="Display name"
                value={form.userName}
                onChange={(e) => setForm((f) => ({ ...f, userName: e.target.value }))}
              />
            </div>
            <Input
              label="Roles"
              value={form.roles}
              onChange={(e) => setForm((f) => ({ ...f, roles: e.target.value }))}
              hint="Comma-separated: tenant_admin, platform_admin, user"
            />
            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={save}>Save session</Button>
              <Button variant="outlined" onClick={resetDemo}>
                Reset to demo
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Active tenant" />
            {tenant ? (
              <dl className="space-y-2 text-[13px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Name</dt>
                  <dd className="font-medium text-slate-800">{tenant.name}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Slug</dt>
                  <dd className="font-mono text-[12px]">{tenant.slug}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Status</dt>
                  <dd>
                    <Badge tone={tenant.status === "active" ? "emerald" : "red"}>{tenant.status}</Badge>
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-[13px] text-slate-400">Tenant not loaded. Check ID and API.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Storage snapshot" />
            {storage ? (
              <dl className="space-y-2 text-[13px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Provider</dt>
                  <dd>
                    <Badge tone="indigo">{storage.provider}</Badge>
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Container</dt>
                  <dd className="font-mono text-[12px]">{storage.container}</dd>
                </div>
                {storage.endpoint && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Endpoint</dt>
                    <dd className="truncate font-mono text-[11px] text-slate-600">{storage.endpoint}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-[13px] text-amber-700">No storage configured for this tenant.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="API proxy" description="Next.js rewrites /api/* to the Express DMS" />
            <p className="font-mono text-[12px] text-slate-600">
              DMS_API_URL → backend (default http://127.0.0.1:3001)
            </p>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
