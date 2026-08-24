"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LoadingBlock } from "@/components/ui/Feedback";
import { ApiError, authApi, platformApi } from "@/lib/api";
import { routeAfterLogin } from "@/lib/session";
import { useSession } from "@/contexts/SessionContext";
import { AuthLayout } from "@/components/auth/AuthLayout";
import type { TenantStatus } from "@/lib/types";

function WorkspaceSignInForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { refreshSession } = useSession();

  const [workspace, setWorkspace] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceStatus, setWorkspaceStatus] = useState<TenantStatus | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Onboarding hands the customer a link that pre-fills their tenant identifier
  // (shown as branding context only — access is decided by the account itself).
  useEffect(() => {
    const prefill = search.get("tenant") || search.get("workspace");
    if (!prefill) return;
    setWorkspace(prefill);
    void platformApi
      .resolveWorkspace(prefill)
      .then((result) => {
        setWorkspaceName(result.workspace.name);
        setWorkspaceStatus(result.workspace.status);
      })
      .catch(() => setWorkspaceName(""));
  }, [search]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const identifier = email.trim();
    const nextErrors: Record<string, string> = {};
    if (!identifier) nextErrors.email = "Email is required";
    if (!password) nextErrors.password = "Password is required";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const result = await authApi.login(identifier, password);
      const next = await refreshSession();
      const target = next ? routeAfterLogin(result.session) : "/login";
      if (result.session.memberships.length === 0 && !result.session.isPlatformAdmin) {
        toast.message("Account ready", {
          description: "No workspace has been assigned to your account yet.",
        });
      }
      router.replace(target);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.status === 401
            ? "Invalid email or password."
            : error.message
          : "Sign in failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Tenant workspace"
      heading="Sign in to your workspace"
      description="Use the email and password of your DMS account."
      panelTitle="Your documents, in your workspace."
      panelPoints={[
        "Upload, version and share documents with your team",
        "Every file is stored in your organisation's own bucket",
        "Access is granted per document: viewer, contributor, manager or owner",
      ]}
      footer={
        <div className="space-y-2">
          <p className="text-center text-[12px] text-[var(--text-muted)]">
            DMS admin?{" "}
            <Link href="/admin/login" className="font-medium text-[var(--accent)] hover:underline">
              Administrator sign-in
            </Link>
          </p>
          <p className="text-center text-[12px] text-[var(--text-muted)]">
            No account yet?{" "}
            <Link href="/signup" className="font-medium text-[var(--accent)] hover:underline">
              Create one
            </Link>
          </p>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {workspace && (
          <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-3">
            <Building2 className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-[var(--text)]">
                {workspaceName || workspace}
              </p>
              <p className="text-[11.5px] text-[var(--text-muted)]">
                {workspaceStatus === "suspended"
                  ? "This workspace is suspended — contact your administrator."
                  : "Workspace from your invite link"}
              </p>
            </div>
          </div>
        )}
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@acme.com"
          autoComplete="username"
          error={errors.email}
          required
          autoFocus
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          error={errors.password}
          required
        />
        <Button type="submit" size="lg" fullWidth loading={submitting}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}

export default function WorkspaceLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <LoadingBlock label="Loading" />
        </div>
      }
    >
      <WorkspaceSignInForm />
    </Suspense>
  );
}
