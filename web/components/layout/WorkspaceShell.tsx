"use client";

import { type ReactNode } from "react";
import { ShellHeader } from "@/contexts/ShellContext";

/**
 * Compatibility wrapper for workspace pages. The shell is now persistent in
 * app/workspace/(workspace)/layout.tsx; this only publishes the route header.
 */
export function WorkspaceShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <ShellHeader title={title} subtitle={subtitle} actions={actions} />
      {children}
    </>
  );
}
