"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";
import { LoadingBlock } from "@/components/ui/Feedback";
import { useSession } from "@/contexts/SessionContext";

/**
 * Shown when the credentials are valid but no workspace has been assigned to
 * the account yet. Nothing about this state is guessable from the outside:
 * the page only renders for an authenticated session.
 */
export default function PendingWorkspacePage() {
  const router = useRouter();
  const { session, ready, signOut } = useSession();

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace("/login");
    } else if (session.isPlatformAdmin) {
      router.replace("/admin");
    } else if (session.tenantId) {
      router.replace("/workspace");
    }
  }, [ready, session, router]);

  if (!ready || !session) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--canvas)]">
        <LoadingBlock label="Loading" />
      </div>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--canvas)] px-5 py-10">
      <div className="w-full max-w-[440px] animate-rise text-center">
        <div className="mb-6 flex justify-center">
          <BrandMark size="lg" />
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 shadow-[var(--shadow-md)]">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]">
            <Clock className="h-5 w-5 text-[var(--accent)]" />
          </span>
          <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.02em] text-[var(--text)]">
            Your account is ready
          </h1>
          <p className="mx-auto mt-2 max-w-[340px] text-[13px] leading-relaxed text-[var(--text-secondary)]">
            You are signed in as <span className="font-medium text-[var(--text)]">{session.email}</span>,
            but no workspace has been assigned to your account yet. Your administrator
            can add you from the workspace&apos;s People page — documents uploaded
            earlier under your email are linked automatically.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-[12.5px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)]"
            >
              Sign out
            </button>
            <Link
              href="/select-workspace"
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
            >
              Refresh workspaces
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
