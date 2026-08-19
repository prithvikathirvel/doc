"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserMenu } from "./UserMenu";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export interface BrandInfo {
  href: string;
  title: string;
  subtitle: string;
  icon?: ReactNode;
}

export function AppShell({
  brand,
  nav,
  aside,
  title,
  subtitle,
  actions,
  children,
}: {
  brand: BrandInfo;
  nav: NavSection[];
  /** Optional context block rendered under the brand, e.g. the tenant being viewed. */
  aside?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <div className="flex min-h-dvh bg-[var(--canvas)]">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] lg:hidden animate-fade"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[264px] shrink-0 flex-col border-r border-[var(--border)] bg-white transition-transform duration-200 ease-out lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b border-[var(--border)] px-4">
          <Link href={brand.href} className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-white">
              {brand.icon}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-semibold tracking-[-0.01em] text-[var(--text)]">
                {brand.title}
              </span>
              <span className="block truncate text-[11px] text-[var(--text-muted)]">{brand.subtitle}</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="-mr-1 rounded-md p-1.5 text-[var(--text-muted)] hover:bg-slate-100 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {aside && <div className="border-b border-[var(--border)] px-3 py-3">{aside}</div>}

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {nav.map((section, index) => (
            <div key={section.title || index} className={cn(index > 0 && "mt-5")}>
              {section.title && (
                <p className="mb-1.5 px-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  {section.title}
                </p>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = item.exact
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
                          active
                            ? "bg-[var(--accent-soft)] font-medium text-[var(--accent-hover)]"
                            : "font-normal text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            active ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
                          )}
                          strokeWidth={1.75}
                        />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-[var(--border)] p-3">
          <UserMenu />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-white/90 backdrop-blur">
          <div className="flex min-h-14 flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="-ml-1 rounded-md p-1.5 text-[var(--text-secondary)] hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-[var(--text)]">
                {title}
              </h1>
              {subtitle && (
                <div className="truncate text-[12px] text-[var(--text-secondary)]">{subtitle}</div>
              )}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
