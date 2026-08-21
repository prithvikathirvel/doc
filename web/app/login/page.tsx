"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, LockKeyhole, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LoadingBlock } from "@/components/ui/Feedback";
import { ApiError, authApi, platformApi } from "@/lib/api";
import {
  MEMBER_ROLE,
  PLATFORM_ADMIN_ROLE,
  TENANT_ADMIN_ROLE,
} from "@/lib/session";
import type { AuthLoginResponse, AuthTenant, Session } from "@/lib/types";
import { useSession } from "@/contexts/SessionContext";
import { AuthLayout } from "@/components/auth/AuthLayout";

const AUTH_MODE = (process.env.NEXT_PUBLIC_AUTH_MODE || "keycloak").toLowerCase();
const SIGNUP_ENABLED = process.env.NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP === "true";

function WorkspaceSignInForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { signIn } = useSession();
  const keycloakMode = AUTH_MODE !== "headers";

  const [workspace, setWorkspace] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(false);
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pendingLogin, setPendingLogin] = useState<AuthLoginResponse | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const prefill = search.get("tenant") || search.get("workspace");
    if (prefill && !keycloakMode) setWorkspace(prefill);
  }, [search, keycloakMode]);

  const finishLogin = (result: AuthLoginResponse, tenant?: AuthTenant) => {
    const roles = result.roles?.length ? result.roles : [result.role];
    const platform = roles.some((role) => toDmsRole(role) === PLATFORM_ADMIN_ROLE) || toDmsRole(result.role) === PLATFORM_ADMIN_ROLE;
    const chosen = tenant || (result.tenants.length === 1 ? result.tenants[0] : undefined);
    if (!platform && !result.tenants.length) {
      toast.error("Your account is not assigned to a DMS workspace yet.");
      return;
    }
    if (!platform && !chosen) {
      setPendingLogin(result);
      setSelectedTenantId(result.tenants[0].id);
      return;
    }

    if (!platform && chosen?.status !== "active") {
      toast.error("This workspace is suspended. Contact your administrator.");
      return;
    }
    const role = platform ? PLATFORM_ADMIN_ROLE : toDmsRole(chosen?.role || result.role);
    const next: Session = {
      scope: platform ? "platform" : "tenant",
      tenantId: platform ? "" : chosen?.id || "",
      tenantName: chosen?.name,
      tenantSlug: chosen?.slug,
      userId: result.user.userId,
      userName: result.user.displayName || result.user.username || result.user.email,
      roles: [role],
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      idToken: result.idToken,
      expiresAt: epochInSeconds(result.expiresIn),
      refreshExpiresAt: result.refreshExpiresIn ? epochInSeconds(result.refreshExpiresIn) : undefined,
      signedInAt: new Date().toISOString(),
    };
    setPendingLogin(null);
    signIn(next);
    router.replace(platform ? "/admin" : "/workspace");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const nextErrors: Record<string, string> = {};
    if (keycloakMode) {
      if (!email.trim()) nextErrors.email = "Email is required";
      if (!password) nextErrors.password = "Password is required";
      if (signup && !username.trim()) nextErrors.username = "Username is required";
    } else {
      if (!workspace.trim()) nextErrors.workspace = "Tenant ID is required";
      if (!email.trim()) nextErrors.email = "Email or user ID is required";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      if (!keycloakMode) {
        const resolved = await platformApi.resolveWorkspace(workspace.trim(), email.trim());
        if (resolved.workspace.status !== "active") {
          toast.error("This workspace is suspended. Contact your administrator.");
          return;
        }
        signIn({
          scope: "tenant",
          tenantId: resolved.workspace.id,
          tenantName: resolved.workspace.name,
          tenantSlug: resolved.workspace.slug,
          userId: email.trim(),
          userName: email.trim(),
          roles: resolved.roles.length ? resolved.roles : [MEMBER_ROLE],
          signedInAt: new Date().toISOString(),
        });
        router.replace("/workspace");
        return;
      }

      if (signup) {
        await authApi.signup({
          email: email.trim(),
          password,
          username: username.trim(),
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
        });
        toast.success("Account created. Please sign in.");
        setSignup(false);
        setPassword("");
        return;
      }

      const loginResult = await authApi.login(email.trim(), password);
      const result = await authApi.resolveTenants(loginResult);
      finishLogin(result);
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 401
          ? signup
            ? "The account could not be created with those details."
            : "Invalid email or password."
          : error instanceof Error
            ? error.message
            : "Sign in failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const chooseTenant = () => {
    if (!pendingLogin) return;
    const selected = pendingLogin.tenants.find((tenant) => tenant.id === selectedTenantId);
    if (!selected) {
      toast.error("Choose a workspace to continue.");
      return;
    }
    finishLogin(pendingLogin, selected);
  };

  const title = signup ? "Create your account" : pendingLogin ? "Choose a workspace" : "Sign in to your workspace";

  return (
    <AuthLayout
      eyebrow="Tenant workspace"
      heading={title}
      description={
        pendingLogin
          ? "Your account belongs to more than one workspace. Choose where you want to work."
          : keycloakMode
            ? "Use the email address and password from your User Management account."
            : "Use the tenant ID and email address from your onboarding email."
      }
      panelTitle="Your documents, in your workspace."
      panelPoints={[
        "Upload, version and share documents with your team",
        "Every file is stored in your organisation's own bucket",
        "Access is granted per document: viewer, contributor, manager or owner",
      ]}
      footer={
        <p className="text-center text-[12px] text-[var(--text-muted)]">
          DMS admin?{" "}
          <Link href="/admin/login" className="font-medium text-[var(--accent)] hover:underline">
            Administrator sign-in
          </Link>
        </p>
      }
    >
      {pendingLogin ? (
        <div className="space-y-4">
          <label className="block text-[12px] font-medium text-[var(--text-secondary)]" htmlFor="tenant-picker">
            Workspace
          </label>
          <select
            id="tenant-picker"
            value={selectedTenantId}
            onChange={(event) => setSelectedTenantId(event.target.value)}
            className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
          >
            {pendingLogin.tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name} ({tenant.role.replace(/_/g, " ")})
              </option>
            ))}
          </select>
          <Button type="button" size="lg" fullWidth onClick={chooseTenant}>
            Open workspace
          </Button>
          <button
            type="button"
            className="w-full text-center text-[12px] text-[var(--text-muted)] hover:text-[var(--text)]"
            onClick={() => setPendingLogin(null)}
          >
            Back to sign in
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {!keycloakMode && (
            <Input
              label="Tenant ID"
              value={workspace}
              onChange={(event) => setWorkspace(event.target.value)}
              placeholder="tenant-id"
              leftIcon={<Building2 className="h-4 w-4" />}
              hint="Used only in local header-auth mode."
              error={errors.workspace}
              required
              autoFocus
            />
          )}
          <Input
            label={keycloakMode ? "Email" : "Email or user ID"}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@acme.com"
            autoComplete="username"
            leftIcon={<Mail className="h-4 w-4" />}
            error={errors.email}
            required
            autoFocus={keycloakMode}
          />
          {keycloakMode && (
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your password"
              autoComplete={signup ? "new-password" : "current-password"}
              leftIcon={<LockKeyhole className="h-4 w-4" />}
              error={errors.password}
              required
            />
          )}
          {signup && (
            <>
              <Input
                label="Username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="your.username"
                autoComplete="username"
                error={errors.username}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Input label="First name" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
                <Input label="Last name" value={lastName} onChange={(event) => setLastName(event.target.value)} />
              </div>
            </>
          )}
          <Button type="submit" size="lg" fullWidth loading={submitting}>
            {signup ? "Create account" : "Open workspace"}
          </Button>
          {keycloakMode && SIGNUP_ENABLED && (
            <button
              type="button"
              className="w-full text-center text-[12px] text-[var(--accent)] hover:underline"
              onClick={() => {
                setSignup((value) => !value);
                setErrors({});
              }}
            >
              {signup ? "Already have an account? Sign in" : "Create an account"}
            </button>
          )}
        </form>
      )}
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

function toDmsRole(value: string | undefined): string {
  const normalized = (value || "").trim().toLowerCase().replace(/^dms[\s_-]+/, "").replace(/[\s-]+/g, "_");
  if (["platform_admin", "platformadmin"].includes(normalized)) return PLATFORM_ADMIN_ROLE;
  if (["tenant_admin", "tenantadmin", "admin"].includes(normalized)) return TENANT_ADMIN_ROLE;
  return MEMBER_ROLE;
}

function epochInSeconds(duration?: number): number | undefined {
  return duration === undefined ? undefined : Math.floor(Date.now() / 1000) + duration;
}
