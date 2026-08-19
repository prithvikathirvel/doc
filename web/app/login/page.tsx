"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, FileStack, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ApiError, apiFetch, platformApi } from "@/lib/api";
import { PLATFORM_ADMIN_ROLE, TENANT_ADMIN_ROLE } from "@/lib/session";
import { cn } from "@/lib/utils";
import { useSession } from "@/contexts/SessionContext";

type Mode = "platform" | "tenant";

const HIGHLIGHTS = [
  "Tenant-isolated document storage on S3, MinIO, Google Cloud or Azure",
  "Versioning, trash and recovery with a complete audit trail",
  "Explicit access levels for every document and principal",
];

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useSession();

  const [mode, setMode] = useState<Mode>("platform");
  const [submitting, setSubmitting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [token, setToken] = useState("");

  const [adminId, setAdminId] = useState("");
  const [adminName, setAdminName] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [userId, setUserId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const signInAsPlatformAdmin = async () => {
    const identifier = adminId.trim();
    if (!identifier) {
      setErrors({ adminId: "Administrator ID is required" });
      return;
    }
    setErrors({});
    setSubmitting(true);
    const session = {
      scope: "platform" as const,
      tenantId: "",
      userId: identifier,
      userName: adminName.trim() || identifier,
      roles: [PLATFORM_ADMIN_ROLE],
      idToken: token.trim(),
      signedInAt: new Date().toISOString(),
    };
    try {
      // Verify the credentials against the API before storing the session.
      await apiFetch("/tenants", { session });
      signIn(session);
      router.replace("/admin");
    } catch (error) {
      const message =
        error instanceof ApiError && (error.status === 401 || error.status === 403)
          ? "The API rejected these administrator credentials."
          : error instanceof Error
            ? error.message
            : "Sign in failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const signInToWorkspace = async () => {
    const workspaceRef = workspace.trim();
    const identifier = userId.trim();
    const nextErrors: Record<string, string> = {};
    if (!workspaceRef) nextErrors.workspace = "Workspace is required";
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
          ? "No workspace matches that name or ID."
          : error instanceof Error
            ? error.message
            : "Sign in failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    void (mode === "platform" ? signInAsPlatformAdmin() : signInToWorkspace());
  };

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="relative hidden overflow-hidden bg-[#101828] px-12 py-14 text-white lg:flex lg:w-[46%] lg:flex-col lg:justify-between xl:px-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 15%, #3b5bdb 0, transparent 45%), radial-gradient(circle at 85% 80%, #475467 0, transparent 40%)",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
              <FileStack className="h-4.5 w-4.5" />
            </span>
            <span className="text-[15px] font-semibold tracking-[-0.01em]">Document Management</span>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">
            One platform for every tenant&apos;s documents.
          </h2>
          <ul className="mt-7 space-y-3.5">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex gap-3 text-[13.5px] leading-relaxed text-white/70">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-white/50" strokeWidth={1.75} />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[12px] text-white/40">
          Storage credentials stay in your environment — the platform stores references only.
        </p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[420px] animate-rise">
          <div className="mb-7 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)] text-white">
              <FileStack className="h-4.5 w-4.5" />
            </span>
          </div>

          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--text)]">Sign in</h1>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            Choose how you want to access the document management system.
          </p>

          <div
            role="tablist"
            aria-label="Sign-in method"
            className="mt-6 grid grid-cols-2 gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-1"
          >
            {(
              [
                { id: "platform", label: "Administrator", icon: ShieldCheck },
                { id: "tenant", label: "Tenant workspace", icon: Building2 },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={mode === tab.id}
                onClick={() => {
                  setMode(tab.id);
                  setErrors({});
                }}
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-medium transition-colors",
                  mode === tab.id
                    ? "bg-white text-[var(--text)] shadow-[var(--shadow-xs)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text)]"
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            {mode === "platform" ? (
              <>
                <Input
                  label="Administrator ID"
                  value={adminId}
                  onChange={(event) => setAdminId(event.target.value)}
                  placeholder="admin@yourcompany.com"
                  autoComplete="username"
                  error={errors.adminId}
                  leftIcon={<ShieldCheck className="h-4 w-4" />}
                  required
                />
                <Input
                  label="Display name"
                  value={adminName}
                  onChange={(event) => setAdminName(event.target.value)}
                  placeholder="Optional"
                />
              </>
            ) : (
              <>
                <Input
                  label="Workspace"
                  value={workspace}
                  onChange={(event) => setWorkspace(event.target.value)}
                  placeholder="acme or workspace ID"
                  error={errors.workspace}
                  leftIcon={<Building2 className="h-4 w-4" />}
                  hint="Provided by your administrator during onboarding."
                  required
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
              </>
            )}

            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]">
              <button
                type="button"
                onClick={() => setShowToken((value) => !value)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12.5px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text)]"
              >
                <KeyRound className="h-3.5 w-3.5" />
                Identity token
                <span className="ml-auto text-[11.5px] font-normal text-[var(--text-muted)]">
                  {showToken ? "Hide" : "Optional"}
                </span>
              </button>
              {showToken && (
                <div className="border-t border-[var(--border)] p-3">
                  <Input
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    placeholder="Paste your JWT"
                    mono
                    hint="Required only when the API enforces token authentication."
                  />
                </div>
              )}
            </div>

            <Button type="submit" size="lg" fullWidth loading={submitting}>
              {mode === "platform" ? "Open admin console" : "Open workspace"}
            </Button>
          </form>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-[11.5px] text-[var(--text-muted)]">
            <Lock className="h-3 w-3" />
            Sessions are scoped to a single tenant and never leave this browser.
          </p>
        </div>
      </main>
    </div>
  );
}
