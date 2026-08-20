"use client";

import { type ReactNode } from "react";
import { ShellHeader } from "@/contexts/ShellContext";

/**
 * Compatibility wrapper for pages that previously rendered the administrator shell
 * themselves. The shell is now persistent in app/admin/(console)/layout.tsx; this
 * component only publishes route-specific header chrome.
 */
export function AdminShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  /** Ignored: tenant context is derived from the current route by AdminChrome. */
  tenantId?: string;
}) {
  return (
    <>
      <ShellHeader title={title} subtitle={subtitle} actions={actions} />
      {children}
    </>
  );
}
