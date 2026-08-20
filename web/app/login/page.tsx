"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LoadingBlock } from "@/components/ui/Feedback";
import { ApiError, platformApi } from "@/lib/api";
import { TENANT_ADMIN_ROLE } from "@/lib/session";
import { useSession } from "@/contexts/SessionContext";
import { AuthLayout, TokenField } from "@/components/auth/AuthLayout";

function WorkspaceSignInForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { signIn } = useSession();

  const [workspace, setWorkspace] = useState("");
  const [userId, setUserId] = useState("");
  const [token, setToken] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Onboarding hands the customer a link that pre-fills their workspace.
  useEffect(() => {
    const prefill = search.get("workspace");
    if (prefill) setWorkspace(prefill);
  }, [search]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const workspaceRef = workspace.trim();
    const identifier = userId.trim();
    const nextErrors: Record<string, string> = {};
    if (!workspaceRef) nextErrors.workspace = "Workspace ID is required";
    if (!identifier) nextErrors.userId = "Email or user ID is required";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const resolved = await platformApi.resolveWorkspace(workspaceRef, identifier);
      if (resolved.workspace.status !== "active") {
        toast.error("This workspace is suspended. Contact your administrator.");
        return;
      }
      signIn({
        scope: "tenant",
        tenantId: resolved.workspace.id,
        tenantName: resolved.workspace.name,
        tenantSlug: resolved.workspace.slug,
        userId: identifier,
        userName: identifier,
        roles: resolved.roles.length ? resolved.roles : [TENANT_ADMIN_ROLE],
        idToken: token.trim(),
        signedInAt: new Date().toISOString(),
      });
      router.replace("/workspace");
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 404
          ? "No workspace matches that ID. Check the link your administrator sent you."
          : error instanceof Error
            ? error.message
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
      description="Use the workspace ID and email address from your onboarding email."
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
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Workspace ID"
          value={workspace}
          onChange={(event) => setWorkspace(event.target.value)}
          placeholder="acme"
          leftIcon={<Building2 className="h-4 w-4" />}
          hint="The short workspace name from your onboarding email, for example “acme”."
          error={errors.workspace}
          required
          autoFocus
        />
        <Input
          label="Email or user ID"
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          placeholder="you@acme.com"
          autoComplete="username"
          error={errors.userId}
          required
        />
        <TokenField value={token} onChange={setToken} />
        <Button type="submit" size="lg" fullWidth loading={submitting}>
          Open workspace
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
