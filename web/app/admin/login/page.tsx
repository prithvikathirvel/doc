"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BrandMark } from "@/components/ui/BrandMark";
import { ApiError, apiFetch, authApi } from "@/lib/api";
import { PLATFORM_ADMIN_ROLE } from "@/lib/session";
import type { Session } from "@/lib/types";
import { useSession } from "@/contexts/SessionContext";

const AUTH_MODE = (process.env.NEXT_PUBLIC_AUTH_MODE || "keycloak").toLowerCase();

export default function AdminLoginPage() {
  const router = useRouter();
  const { signIn } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const keycloakMode = AUTH_MODE !== "headers";
    if (!email.trim() || (keycloakMode && !password)) {
      setError(!email.trim() ? "Email is required" : "Password is required");
      return;
    }
    setError(undefined);
    setSubmitting(true);

    try {
      if (!keycloakMode) {
        const session: Session = {
          scope: "platform",
          tenantId: "",
          userId: email.trim(),
          userName: displayName.trim() || email.trim(),
          roles: [PLATFORM_ADMIN_ROLE],
          signedInAt: new Date().toISOString(),
        };
        await apiFetch("/tenants", { session });
        signIn(session);
        router.replace("/admin");
        return;
      }
      const loginResult = await authApi.login(email.trim(), password);
      const result = await authApi.resolveTenants(loginResult);
      const roles = result.roles?.length ? result.roles : [result.role];
      if (!roles.some((role) => toDmsRole(role) === PLATFORM_ADMIN_ROLE)) {
        throw new ApiError("Platform administrator role required.", 403);
      }
      const session: Session = {
        scope: "platform",
        tenantId: "",
        userId: result.user.userId,
        userName: result.user.displayName || result.user.username || result.user.email,
        roles: [PLATFORM_ADMIN_ROLE],
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        idToken: result.idToken,
        expiresAt: epochInSeconds(result.expiresIn),
        refreshExpiresAt: result.refreshExpiresIn ? epochInSeconds(result.refreshExpiresIn) : undefined,
        signedInAt: new Date().toISOString(),
      };
      signIn(session);
      router.replace("/admin");
    } catch (apiError) {
      const message =
        apiError instanceof ApiError && apiError.status === 403
          ? "This account is not a platform administrator."
          : apiError instanceof ApiError && apiError.status === 401
            ? "Invalid email or password."
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
            label={AUTH_MODE === "headers" ? "Administrator ID" : "Email"}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@yourcompany.com"
            autoComplete="username"
            leftIcon={AUTH_MODE === "headers" ? <ShieldCheck className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
            error={error}
            required
            autoFocus
          />
          {AUTH_MODE === "headers" ? (
            <Input
              label="Display name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Optional"
            />
          ) : (
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your password"
              autoComplete="current-password"
              leftIcon={<LockKeyhole className="h-4 w-4" />}
              required
            />
          )}
          <Button type="submit" size="lg" fullWidth loading={submitting}>
            <ShieldCheck className="mr-2 h-4 w-4" />
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

function toDmsRole(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/^dms[\s_-]+/, "").replace(/[\s-]+/g, "_");
  return ["platform_admin", "platformadmin"].includes(normalized) ? PLATFORM_ADMIN_ROLE : normalized;
}

function epochInSeconds(duration?: number): number | undefined {
  return duration === undefined ? undefined : Math.floor(Date.now() / 1000) + duration;
}
