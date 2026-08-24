"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { ApiError, authApi } from "@/lib/api";
import { routeAfterLogin } from "@/lib/session";
import { useSession } from "@/contexts/SessionContext";

export default function AdminLoginPage() {
  const router = useRouter();
  const { refreshSession } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

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
      // Credentials are verified by Keycloak through the User Service; whether
      // this person really is a platform administrator is decided by the DMS
      // directory, never by this page.
      const result = await authApi.login(identifier, password);
      await refreshSession();
      const target = routeAfterLogin(result.session);
      if (!result.session.isPlatformAdmin) {
        toast.message("Signed in", {
          description: "This account is a workspace member — opening your workspace.",
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
      eyebrow="Platform console"
      heading="Administrator sign-in"
      description="Use your platform administrator email and password."
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
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="admin@yourcompany.com"
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
          Open admin console
        </Button>
      </form>
    </AuthLayout>
  );
}
