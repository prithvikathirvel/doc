"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BrandMark } from "@/components/ui/BrandMark";
import { ApiError, apiFetch } from "@/lib/api";
import { PLATFORM_ADMIN_ROLE } from "@/lib/session";
import { useSession } from "@/contexts/SessionContext";

export default function AdminLoginPage() {
  const router = useRouter();
  const { signIn } = useSession();

  const [adminId, setAdminId] = useState("");
  const [displayName, setDisplayName] = useState("");
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
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[var(--canvas)] px-5 py-12">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 18% 12%, #eef2ff 0, transparent 32%), radial-gradient(circle at 82% 78%, #eef4ff 0, transparent 34%)",
        }}
      />
      <div className="relative w-full max-w-[400px] animate-rise">
        <div className="flex justify-center">
          <BrandMark size="lg" />
        </div>

        <div className="mt-8 text-center">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--text)]">
            Administrator sign-in
          </h1>
          <p className="mx-auto mt-2 max-w-[340px] text-[13px] leading-relaxed text-[var(--text-secondary)]">
            Onboard tenants, attach storage and review usage across every workspace.
          </p>
        </div>

        <form onSubmit={submit} className="mt-7 space-y-4 bg-transparent p-1">
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
          <Button type="submit" size="lg" fullWidth loading={submitting}>
            Open admin console
          </Button>
        </form>

        <p className="mt-6 text-center text-[12px] text-[var(--text-muted)]">
          Signing in to a customer workspace?{" "}
          <Link href="/login" className="font-medium text-[var(--accent)] hover:underline">
            Tenant sign-in
          </Link>
        </p>
      </div>
    </main>
  );
}
