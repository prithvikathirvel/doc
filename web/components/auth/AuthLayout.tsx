"use client";

import { type ReactNode } from "react";
import { BrandMark } from "@/components/ui/BrandMark";

/** Shared chrome for the two sign-in entry points: tenant workspace and administrator. */
export function AuthLayout({
  eyebrow,
  heading,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  heading: string;
  description: string;
  panelTitle?: string;
  panelPoints?: string[];
  panelTone?: "light" | "dark";
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[var(--canvas)] px-5 py-10 sm:px-8">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 18% 12%, #eef2ff 0, transparent 32%), radial-gradient(circle at 82% 78%, #eef4ff 0, transparent 34%)",
        }}
      />

      <div className="relative w-full max-w-[440px] animate-rise">
        <div className="mb-7 flex justify-center">
          <BrandMark size="lg" />
        </div>

        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          {eyebrow}
        </p>
        <h1 className="mt-1 text-center text-[24px] font-semibold tracking-[-0.02em] text-[var(--text)]">
          {heading}
        </h1>
        <p className="mx-auto mt-2 max-w-[360px] text-center text-[13px] leading-relaxed text-[var(--text-secondary)]">
          {description}
        </p>

        <div className="mt-6">{children}</div>

        {footer && <div className="mt-6">{footer}</div>}
      </div>
    </div>
  );
}
