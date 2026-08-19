"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Building2,
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
import { tenantsApi } from "@/lib/api";
import type { Tenant } from "@/lib/types";

const CONSOLE_NAV: NavSection[] = [
  {
    title: "Platform",
    items: [
      { href: "/admin", label: "Tenants", icon: Building2, exact: true },
      { href: "/admin/system", label: "System health", icon: Activity },
    ],
  },
];

/** Guard + chrome for the platform administrator console. */
export function AdminShell({
  title,
  subtitle,
  actions,
  children,
  tenantId,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** When set, the sidebar switches to the navigation of that tenant's workspace. */
  tenantId?: string;
}) {
  const router = useRouter();
  const { ready, session, isPlatformAdmin } = useSession();
  const [tenant, setTenant] = useState<Tenant | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (!isPlatformAdmin) router.replace("/workspace");
  }, [ready, session, isPlatformAdmin, router]);

  useEffect(() => {
    if (!tenantId) {
      setTenant(null);
      return;
    }
    let cancelled = false;
    void tenantsApi
      .get(tenantId)
      .then((result) => {
        if (!cancelled) setTenant(result.tenant);
      })
      .catch(() => {
        if (!cancelled) setTenant(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  if (!ready || !session || !isPlatformAdmin) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoadingBlock label="Preparing console" />
      </div>
    );
  }

  const base = tenantId ? `/admin/tenants/${tenantId}` : "";
  const nav: NavSection[] = tenantId
    ? [
        {
          title: "Tenant",
          items: [
            { href: base, label: "Overview", icon: LayoutDashboard, exact: true },
            { href: `${base}/documents`, label: "Documents", icon: FileText },
            { href: `${base}/folders`, label: "Folders", icon: FolderOpen },
            { href: `${base}/trash`, label: "Trash", icon: Trash2 },
            { href: `${base}/settings`, label: "Settings", icon: Settings },
          ],
        },
        ...CONSOLE_NAV,
      ]
    : CONSOLE_NAV;

  return (
    <AppShell
      brand={{
        href: "/admin",
        title: "DMS Console",
        subtitle: "Platform administration",
        icon: <FileStack className="h-4 w-4" />,
      }}
      nav={nav}
      aside={
        tenantId ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-2.5">
            <Link
              href="/admin"
              className="mb-2 inline-flex items-center gap-1.5 text-[11.5px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text)]"
            >
              <ArrowLeft className="h-3 w-3" />
              All tenants
            </Link>
            <p className="truncate text-[13px] font-medium text-[var(--text)]">
              {tenant?.name || "Loading"}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5">
              {tenant && (
                <Badge tone={tenant.status === "active" ? "success" : "danger"} dot>
                  {tenant.status === "active" ? "Active" : "Suspended"}
                </Badge>
              )}
              {tenant && <span className="truncate font-mono text-[11px] text-[var(--text-muted)]">{tenant.slug}</span>}
            </div>
          </div>
        ) : undefined
      }
      title={title}
      subtitle={subtitle}
      actions={actions}
    >
      {children}
    </AppShell>
  );
}
