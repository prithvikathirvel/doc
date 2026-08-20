"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthLayout, TokenField } from "@/components/auth/AuthLayout";
import { ApiError, apiFetch } from "@/lib/api";
import { PLATFORM_ADMIN_ROLE } from "@/lib/session";
import { useSession } from "@/contexts/SessionContext";

export default function AdminLoginPage() {
  const router = useRouter();
  const { signIn } = useSession();

  const [adminId, setAdminId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const identifier = adminId.trim();
    if (!identifier) {
      setError("Administrator ID is required");
      return;
    }
    setError(undefined);
    setSubmitting(true);

    const session = {
      scope: "platform" as const,
      tenantId: "",
      userId: identifier,
      userName: displayName.trim() || identifier,
      roles: [PLATFORM_ADMIN_ROLE],
      idToken: token.trim(),
      signedInAt: new Date().toISOString(),
    };

    try {
      // The API decides whether these credentials really carry platform_admin.
      await apiFetch("/tenants", { session });
      signIn(session);
      router.replace("/admin");
    } catch (apiError) {
      const message =
        apiError instanceof ApiError && (apiError.status === 401 || apiError.status === 403)
          ? "The API rejected these administrator credentials."
          : apiError instanceof Error
            ? apiError.message
            : "Sign in failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Platform administration"
      heading="Administrator sign-in"
      description="Onboard tenants, attach storage and review usage across every workspace."
      panelTitle="Run the platform, tenant by tenant."
      panelPoints={[
        "Onboard customers with validated storage in one guided flow",
        "Inspect any tenant's documents, folders, trash and usage analytics",
        "Keep vendor credentials as environment references, never as stored secrets",
      ]}
      panelTone="dark"
      footer={
        <p className="text-center text-[12px] text-[var(--text-muted)]">
          Signing in to a customer workspace?{" "}
          <Link href="/login" className="font-medium text-[var(--accent)] hover:underline">
            Tenant sign-in
          </Link>
        </p>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Administrator ID"
          value={adminId}
          onChange={(event) => setAdminId(event.target.value)}
          placeholder="admin@yourcompany.com"
          autoComplete="username"
          leftIcon={<ShieldCheck className="h-4 w-4" />}
          error={error}
          required
          autoFocus
        />
        <Input
          label="Display name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Optional"
        />
        <TokenField value={token} onChange={setToken} />
        <Button type="submit" size="lg" fullWidth loading={submitting}>
          Open admin console
        </Button>
      </form>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-[11.5px] text-[var(--text-muted)]">
        <Lock className="h-3 w-3" />
        Administrator sessions never carry a tenant context until you open a tenant.
      </p>
    </AuthLayout>
  );
}
