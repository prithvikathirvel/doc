"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  FileStack,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Settings,
  Trash2,
} from "lucide-react";
import { AppShell, type NavSection } from "./AppShell";
import { LoadingBlock } from "@/components/ui/Feedback";
import { Badge } from "@/components/ui/Badge";
import { useSession } from "@/contexts/SessionContext";
import { providerLabel } from "@/lib/utils";

const NAV: NavSection[] = [
  {
    title: "Workspace",
    items: [
      { href: "/workspace", label: "Overview", icon: LayoutDashboard, exact: true },
      { href: "/workspace/documents", label: "Documents", icon: FileText },
      { href: "/workspace/folders", label: "Folders", icon: FolderOpen },
      { href: "/workspace/trash", label: "Trash", icon: Trash2 },
      { href: "/workspace/settings", label: "Settings", icon: Settings },
    ],
  },
];

/** Guard + chrome for a signed-in tenant user. Only their own tenant is reachable. */
export function WorkspaceShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const { ready, session, isPlatformAdmin, tenant, storage } = useSession();

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (isPlatformAdmin) router.replace("/admin");
  }, [ready, session, isPlatformAdmin, router]);

  if (!ready || !session || isPlatformAdmin) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoadingBlock label="Opening workspace" />
      </div>
    );
  }

  return (
    <AppShell
      brand={{
        href: "/workspace",
        title: tenant?.name || session.tenantName || "Workspace",
        subtitle: "Document workspace",
        icon: <FileStack className="h-4 w-4" />,
      }}
      nav={NAV}
      aside={
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Storage
          </p>
          <p className="mt-1 truncate text-[12.5px] text-[var(--text)]">
            {storage ? providerLabel(storage.provider) : "Not configured"}
          </p>
          {storage && (
            <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-muted)]">
              {storage.container}
            </p>
          )}
          {!storage && (
            <Badge tone="warning" className="mt-1.5">
              Contact your administrator
            </Badge>
          )}
        </div>
      }
      title={title}
      subtitle={subtitle}
      actions={actions}
    >
      {children}
    </AppShell>
  );
}
