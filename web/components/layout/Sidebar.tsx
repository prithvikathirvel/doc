"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Settings,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/contexts/SessionContext";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard, section: "Workspace" },
  { href: "/documents", label: "Documents", icon: FileText, section: "Workspace" },
  { href: "/folders", label: "Folders", icon: FolderOpen, section: "Workspace" },
  { href: "/trash", label: "Trash", icon: Trash2, section: "Workspace" },
  { href: "/tenants", label: "Tenants", icon: Building2, section: "Admin", admin: true },
  { href: "/health", label: "Health", icon: Activity, section: "System" },
  { href: "/settings", label: "Settings", icon: Settings, section: "System" },
];

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const { isAdmin } = useSession();

  const sections = ["Workspace", "Admin", "System"] as const;

  return (
    <aside
      className={cn(
        "dms-sidebar relative flex h-full shrink-0 flex-col border-r border-gray-200 bg-white transition-[width] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
        collapsed ? "w-[60px]" : "w-[232px]"
      )}
    >
      <div className={cn("flex h-16 items-center border-b border-slate-100", collapsed ? "justify-center px-2" : "gap-2.5 px-4")}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-[0_1px_2px_0_rgba(79,70,229,0.2)]">
          <FileText className="h-4 w-4" strokeWidth={2} />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold tracking-tight text-slate-900">DMS</p>
            <p className="truncate text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Documents
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {sections.map((section) => {
          const items = NAV.filter((n) => n.section === section && (!n.admin || isAdmin));
          if (items.length === 0) return null;
          return (
            <div key={section} className="mb-3">
              {!collapsed && (
                <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  {section}
                </p>
              )}
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] transition-colors",
                          active
                            ? "bg-slate-100 font-semibold text-slate-900"
                            : "font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                        )}
                      >
                        {active && (
                          <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-slate-700" />
                        )}
                        <Icon
                          className={cn("h-4 w-4 shrink-0", active ? "text-indigo-600" : "text-slate-400")}
                          strokeWidth={1.75}
                        />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={onToggle}
        className="m-2 flex h-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </aside>
  );
}
