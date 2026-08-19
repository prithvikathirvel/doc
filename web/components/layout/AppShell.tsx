"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

const COLLAPSE_KEY = "dms.sidebar.collapsed";

export function AppShell({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = () => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc]">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="dms-main flex min-w-0 flex-1 flex-col">
        <Header title={title} subtitle={subtitle} />
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
