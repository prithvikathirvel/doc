"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { LoadingBlock } from "@/components/ui/Feedback";
import { BrandMark } from "@/components/ui/BrandMark";
import { useSession } from "@/contexts/SessionContext";
import { saveActiveTenant } from "@/lib/session";

/**
 * Workspace picker: shown to members of more than one workspace right after
 * sign-in. The choice is remembered locally and validated by the API on every
 * request (membership is enforced server-side).
 */
export default function SelectWorkspacePage() {
  const router = useRouter();
  const { session, ready, signOut } = useSession();
  const [choosing, setChoosing] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace("/login");
    } else if (session.isPlatformAdmin) {
      router.replace("/admin");
    } else if (session.memberships.length === 1) {
      saveActiveTenant(session.memberships[0].tenantId);
      router.replace("/workspace");
    }
  }, [ready, session, router]);

  const choose = (tenantId: string) => {
    if (choosing) return;
    setChoosing(tenantId);
    saveActiveTenant(tenantId);
    router.replace("/workspace");
  };

  if (!ready || !session) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--canvas)]">
        <LoadingBlock label="Loading your workspaces" />
      </div>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--canvas)] px-5 py-10">
      <div className="w-full max-w-[480px] animate-rise">
        <div className="mb-7 flex justify-center">
          <BrandMark size="lg" />
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)]">
          <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--text)]">
            Choose a workspace
          </h1>
          <p className="mt-1.5 text-[13px] text-[var(--text-secondary)]">
            {session.userName}, your account has access to {session.memberships.length} workspaces.
          </p>

          <ul className="mt-5 space-y-2.5">
            {session.memberships.map((membership) => (
              <li key={membership.tenantId}>
                <button
                  type="button"
                  onClick={() => choose(membership.tenantId)}
                  disabled={Boolean(choosing)}
                  className="group flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface-muted)] disabled:opacity-60"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]">
                    <Building2 className="h-4.5 w-4.5 text-[var(--text-secondary)]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-[var(--text)]">
                      {membership.name}
                    </span>
                    <span className="block truncate text-[12px] text-[var(--text-muted)]">
                      /{membership.slug} · {membership.role === "tenant_admin" ? "Administrator" : "Member"}
                    </span>
                  </span>
                  {membership.status === "suspended" && <Badge tone="danger">Suspended</Badge>}
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5" />
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-5 w-full text-center text-[12px] text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          >
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
