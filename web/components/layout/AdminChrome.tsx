"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Building2,
  FileStack,
  FileText,
  LayoutDashboard,
  Settings,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, type NavSection } from "./AppShell";
import { LoadingBlock } from "@/components/ui/Feedback";
import { Badge } from "@/components/ui/Badge";
import { useSession } from "@/contexts/SessionContext";
import { ShellProvider, ShellSlot } from "@/contexts/ShellContext";
import { ApiError, tenantsApi } from "@/lib/api";
import type { Tenant } from "@/lib/types";

const TENANT_SEGMENT = "/admin/tenants/";

function useTenantIdFromPath(): string | undefined {
  const pathname = usePathname() || "";
  return useMemo(() => {
    if (!pathname.startsWith(TENANT_SEGMENT)) return undefined;
    const rest = pathname.slice(TENANT_SEGMENT.length);
    const [id] = rest.split("/");
    return id || undefined;
  }, [pathname]);
}

const CONSOLE_NAV: NavSection[] = [
  {
    title: "Platform",
    items: [
      { href: "/admin", label: "Tenants", icon: Building2, exact: true },
      { href: "/admin/system", label: "System health", icon: Activity },
    ],
  },
];

function TenantAside({ tenantId }: { tenantId: string }) {
  const { ready, session } = useSession();
  const [tenant, setTenant] = useState<Tenant | null>(null);

  useEffect(() => {
    if (!ready || !session) return;
    let cancelled = false;
    void tenantsApi
      .get(tenantId)
      .then((result) => {
        if (!cancelled) setTenant(result.tenant);
      })
      .catch((error) => {
        if (cancelled) return;
        setTenant(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, ready, session]);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-2.5">
      <Link
        href="/admin"
        className="mb-2 inline-flex items-center gap-1.5 text-[11.5px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text)]"
      >
        <ArrowLeft className="h-3 w-3" />
        All tenants
      </Link>
      <p className="truncate text-[13px] font-medium text-[var(--text)]">{tenant?.name || "Loading"}</p>
      <div className="mt-1.5 flex items-center gap-1.5">
        {tenant && (
          <Badge tone={tenant.status === "active" ? "success" : "danger"} dot>
            {tenant.status === "active" ? "Active" : "Suspended"}
          </Badge>
        )}
      </div>
    </div>
  );
}

function Chrome({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "";

  const { ready, session, isPlatformAdmin } = useSession();
  const tenantId = useTenantIdFromPath();

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace("/admin/login");
      return;
    }
    if (!isPlatformAdmin) router.replace("/workspace");
  }, [ready, session, isPlatformAdmin, router]);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    void tenantsApi.get(tenantId).catch((error) => {
      if (cancelled) return;
      if (error instanceof ApiError && error.status === 404) {
        toast.error("That tenant no longer exists.");
        router.replace("/admin");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId, router]);

  if (!ready || !session || !isPlatformAdmin) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--canvas)]">
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
            { href: `${base}/documents`, label: "Files", icon: FileText },
            { href: `${base}/users`, label: "People", icon: Users },
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
      aside={tenantId ? <TenantAside tenantId={tenantId} /> : undefined}
      headerSlot={<ShellSlot />}
    >
      {/* The shell stays mounted across navigations; keying by path keeps page state local
          without recreating the sidebar or session guard. */}
      <div key={pathname}>{children}</div>
    </AppShell>
  );
}

/** Persistent administrator shell mounted once by app/admin/(console)/layout.tsx. */
export function AdminChrome({ children }: { children: ReactNode }) {
  return (
    <ShellProvider>
      <Chrome>{children}</Chrome>
    </ShellProvider>
  );
}
