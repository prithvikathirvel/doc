"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BrandMark } from "@/components/ui/BrandMark";
import { ApiError, authApi } from "@/lib/api";
import { routeAfterLogin } from "@/lib/session";
import { useSession } from "@/contexts/SessionContext";

export default function AdminLoginPage() {
  const router = useRouter();
  const { refreshSession } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const identifier = email.trim();
    if (!identifier || !password) {
      setError("Email and password are required");
      return;
    }
    setError(undefined);
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
    } catch (apiError) {
      const message =
        apiError instanceof ApiError && apiError.status === 401
          ? "Invalid email or password."
          : apiError instanceof Error
            ? apiError.message
            : "Sign in failed";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[var(--canvas)] px-5 py-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 15%, #e8e2ff 0, transparent 34%), radial-gradient(circle at 80% 85%, #dff0ff 0, transparent 32%)",
        }}
      />

      <div className="relative w-full max-w-[420px] animate-rise">
        <div className="mb-7 flex justify-center">
          <BrandMark size="lg" />
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 shadow-[var(--shadow-md)]">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]">
            <ShieldCheck className="h-5 w-5 text-[var(--accent)]" />
          </div>

          <div className="mt-4">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--text)]">
              Administrator sign-in
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
              Onboard tenants, attach storage and review usage across every workspace.
              Platform access is granted by the DMS directory, not by this page.
            </p>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@yourcompany.com"
              autoComplete="username"
              error={error}
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
              required
            />
            <Button type="submit" size="lg" fullWidth loading={submitting}>
              Open admin console
            </Button>
          </form>
        </div>

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
