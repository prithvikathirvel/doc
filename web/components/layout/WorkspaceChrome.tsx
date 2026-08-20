"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  FileStack,
  FileText,
  LayoutDashboard,
  Settings,
  Trash2,
  Users,
} from "lucide-react";
import { AppShell, type NavSection } from "./AppShell";
import { LoadingBlock } from "@/components/ui/Feedback";
import { Badge } from "@/components/ui/Badge";
import { useSession } from "@/contexts/SessionContext";
import { ShellProvider, ShellSlot } from "@/contexts/ShellContext";
import { providerLabel } from "@/lib/utils";
import { TENANT_ADMIN_ROLE } from "@/lib/session";

const BASE_ITEMS = [
  { href: "/workspace", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/workspace/documents", label: "Files", icon: FileText },
  { href: "/workspace/trash", label: "Trash", icon: Trash2 },
];

const ADMIN_ITEM = { href: "/workspace/users", label: "People", icon: Users };
const SETTINGS_ITEM = { href: "/workspace/settings", label: "Settings", icon: Settings };

function Chrome({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "";

  const { ready, session, isPlatformAdmin, tenant, storage } = useSession();
  const isTenantAdmin = Boolean(session?.roles.includes(TENANT_ADMIN_ROLE));

  const nav: NavSection[] = useMemo(
    () => [
      {
        title: "Workspace",
        items: isTenantAdmin ? [...BASE_ITEMS, ADMIN_ITEM, SETTINGS_ITEM] : [...BASE_ITEMS, SETTINGS_ITEM],
      },
    ],
    [isTenantAdmin]
  );

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
      <div className="flex min-h-dvh items-center justify-center bg-[var(--canvas)]">
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
      nav={nav}
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
      headerSlot={<ShellSlot />}
    >
      <div key={pathname}>{children}</div>
    </AppShell>
  );
}

/** Persistent tenant workspace shell mounted once by app/workspace/(workspace)/layout.tsx. */
export function WorkspaceChrome({ children }: { children: ReactNode }) {
  return (
    <ShellProvider>
      <Chrome>{children}</Chrome>
    </ShellProvider>
  );
}
