"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface ShellHeader {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

interface ShellContextValue {
  header: ShellHeader;
  setHeader: (next: ShellHeader) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

/**
 * Keeps persistent shell chrome outside the route content. Pages update only the
 * header through <ShellHeader />, so navigation no longer remounts the sidebar,
 * guards or providers.
 */
export function ShellProvider({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<ShellHeader>({ title: "" });
  const value = useMemo(() => ({ header, setHeader }), [header]);
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

/** Write route-specific title/subtitle/actions into the nearest persistent shell. */
export function ShellHeader({ title, subtitle, actions }: ShellHeader) {
  const context = useContext(ShellContext);
  useLayoutEffect(() => {
    context?.setHeader({ title, subtitle, actions });
  }, [context, title, subtitle, actions]);
  return null;
}

export function useShell() {
  const context = useContext(ShellContext);
  if (!context) throw new Error("useShell must be used within a ShellProvider");
  return context;
}
