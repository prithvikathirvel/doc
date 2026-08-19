"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Shield } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { InlineLoader } from "@/components/ui/Loader";
import { useSession } from "@/contexts/SessionContext";
import { DEFAULT_SESSION } from "@/lib/session";

const PRESETS = [
  {
    label: "Alice · Tenant admin (demo)",
    tenantId: "11111111-1111-1111-1111-111111111111",
    userId: "alice",
    userName: "Alice Kumar",
    roles: "tenant_admin",
  },
  {
    label: "Bob · Read-only user",
    tenantId: "11111111-1111-1111-1111-111111111111",
    userId: "bob",
    userName: "Bob Chen",
    roles: "user",
  },
  {
    label: "Platform admin",
    tenantId: "11111111-1111-1111-1111-111111111111",
    userId: "admin-1",
    userName: "Platform Admin",
    roles: "platform_admin,tenant_admin",
  },
];

function LoginForm() {
  const { setSession, session } = useSession();
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/";

  const [tenantId, setTenantId] = useState(session.tenantId || DEFAULT_SESSION.tenantId);
  const [userId, setUserId] = useState(session.userId || DEFAULT_SESSION.userId);
  const [userName, setUserName] = useState(session.userName || DEFAULT_SESSION.userName);
  const [roles, setRoles] = useState(session.roles.join(",") || "tenant_admin");
  const [idToken, setIdToken] = useState(session.idToken || "");

  const applyPreset = (idx: number) => {
    const p = PRESETS[idx];
    setTenantId(p.tenantId);
    setUserId(p.userId);
    setUserName(p.userName);
    setRoles(p.roles);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId.trim() || !userId.trim()) {
      toast.error("Tenant ID and User ID are required");
      return;
    }
    const roleList = roles
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    setSession({
      tenantId: tenantId.trim(),
      userId: userId.trim(),
      userName: userName.trim() || userId.trim(),
      roles: roleList.length ? roleList : ["user"],
      idToken: idToken.trim(),
    });
    toast.success("Session ready");
    router.replace(next);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f8fafc] px-4 py-10">
      <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-indigo-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-violet-200/25 blur-3xl" />

      <div className="relative w-full max-w-md animate-fade-up">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-[0_1px_2px_0_rgba(79,70,229,0.2)]">
            <FileText className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Sign in to DMS</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Secure workspace access for your document operations.
          </p>
        </div>

        <Card className="p-6">
          <form onSubmit={onSubmit} className="space-y-3.5">
            <Select
              label="Workspace profile"
              options={[
                { value: "", label: "Custom…" },
                ...PRESETS.map((p, i) => ({ value: String(i), label: p.label })),
              ]}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value !== "") applyPreset(Number(e.target.value));
              }}
            />
            <Input
              label="Tenant ID"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              required
              placeholder="uuid"
              className="font-mono text-[12.5px]"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="User ID"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                required
              />
              <Input
                label="Display name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
              />
            </div>
            <Input
              label="Roles (comma-separated)"
              value={roles}
              onChange={(e) => setRoles(e.target.value)}
              hint="e.g. tenant_admin, platform_admin, user"
            />

            <Input
              label="Identity token"
              value={idToken}
              onChange={(e) => setIdToken(e.target.value)}
              placeholder="Paste your identity token when required"
              hint="Required only if the API rejects with “Token not provided”. Sent as idtoken + Authorization: Bearer."
              className="font-mono text-[12px]"
            />

            <div className="flex items-start gap-2 rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2.5">
              <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
              <p className="text-[11.5px] leading-relaxed text-indigo-800">
                For local development, set <code className="font-mono">AUTH_DISABLED=true</code> on the Express API and
                restart it. Then this UI only needs{" "}
                <code className="font-mono">x-tenant-id</code> / <code className="font-mono">x-user-id</code> /{" "}
                <code className="font-mono">x-roles</code>. If auth is enabled, paste a JWT above.
              </p>
            </div>

            <Button type="submit" className="w-full" size="lg">
              Continue to workspace
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-[11px] text-slate-400">
          Secure document management for every team
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
          <InlineLoader label="Loading…" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
