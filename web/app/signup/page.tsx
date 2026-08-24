"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ApiError, authApi } from "@/lib/api";
import { AuthLayout } from "@/components/auth/AuthLayout";

/**
 * Self-signup: creates the account in the identity provider. A workspace
 * administrator then adds the account to a workspace (or it is attached with
 * its legacy identifiers so earlier uploads are claimed automatically).
 */
export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    username: "",
    password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const nextErrors: Record<string, string> = {};
    if (!form.email.trim()) nextErrors.email = "Email is required";
    if (form.password.length < 8) nextErrors.password = "At least 8 characters";
    // The identity provider rejects names shorter than 3 characters.
    if (form.firstName.trim() && form.firstName.trim().length < 3) {
      nextErrors.firstName = "At least 3 characters, or leave empty";
    }
    if (form.lastName.trim() && form.lastName.trim().length < 3) {
      nextErrors.lastName = "At least 3 characters, or leave empty";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      await authApi.signup({
        email: form.email.trim(),
        password: form.password,
        username: form.username.trim() || undefined,
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
      });
      toast.success("Account created", {
        description: "Ask your workspace administrator to add you, then sign in.",
      });
      router.replace("/login");
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Signup failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Create your account"
      heading="Sign up for DMS"
      description="Your account is created securely. A workspace administrator grants access to your team's workspace."
      panelTitle="One account, your workspaces."
      panelPoints={[
        "Credentials are managed by your organisation's identity provider",
        "Passwords are never stored in the DMS database",
        "Documents uploaded earlier under your email are linked automatically",
      ]}
      footer={
        <p className="text-center text-[12px] text-[var(--text-muted)]">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-[var(--accent)] hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="First name"
            value={form.firstName}
            onChange={set("firstName")}
            placeholder="Jane"
            autoComplete="given-name"
            error={errors.firstName}
            hint="3+ characters or empty"
          />
          <Input
            label="Last name"
            value={form.lastName}
            onChange={set("lastName")}
            placeholder="Doe"
            autoComplete="family-name"
            error={errors.lastName}
            hint="3+ characters or empty"
          />
        </div>
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={set("email")}
          placeholder="you@acme.com"
          autoComplete="email"
          error={errors.email}
          required
          autoFocus
        />
        <Input
          label="Username"
          value={form.username}
          onChange={set("username")}
          placeholder="Optional — derived from your email"
          autoComplete="username"
        />
        <Input
          label="Password"
          type="password"
          value={form.password}
          onChange={set("password")}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          error={errors.password}
          required
        />
        <Button type="submit" size="lg" fullWidth loading={submitting} leftIcon={<UserPlus className="h-4 w-4" />}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
