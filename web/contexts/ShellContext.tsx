"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

interface ShellHeader {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

const ShellContainerContext = createContext<HTMLElement | null>(null);
const ShellRegisterContext = createContext<((node: HTMLElement | null) => void) | null>(null);

/**
 * Persistent shell chrome is rendered outside route content. Pages communicate
 * with it through a portal target instead of repeatedly setting context state,
 * which avoids update loops when props/actions are recreated on each render.
 */
export function ShellProvider({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  return (
    <ShellRegisterContext.Provider value={setContainer}>
      <ShellContainerContext.Provider value={container}>{children}</ShellContainerContext.Provider>
    </ShellRegisterContext.Provider>
  );
}

/** The DOM slot owned by the persistent shell and rendered in its top bar. */
export function ShellSlot() {
  const register = useContext(ShellRegisterContext);
  return <div ref={register} className="flex min-w-0 flex-1 items-center gap-3" />;
}

/** Write route-specific title/subtitle/actions into the nearest persistent shell. */
export function ShellHeader({ title, subtitle, actions }: ShellHeader) {
  const container = useContext(ShellContainerContext);
  if (!container) return null;

  return createPortal(
    <>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-[var(--text)]">
          {title}
        </h1>
        {subtitle && (
          <div className="truncate text-[12px] text-[var(--text-secondary)]">{subtitle}</div>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </>,
    container
  );
}
