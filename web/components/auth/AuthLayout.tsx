"use client";

import { useState, type ReactNode } from "react";
import { FileStack, KeyRound, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/Input";

/** Shared chrome for the two sign-in entry points: tenant workspace and administrator. */
export function AuthLayout({
  eyebrow,
  heading,
  description,
  panelTitle,
  panelPoints,
  panelTone = "light",
  children,
  footer,
}: {
  eyebrow: string;
  heading: string;
  description: string;
  panelTitle: string;
  panelPoints: string[];
  panelTone?: "light" | "dark";
  children: ReactNode;
  footer?: ReactNode;
}) {
  const dark = panelTone === "dark";
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside
        className={`relative hidden overflow-hidden px-12 py-14 lg:flex lg:w-[44%] lg:flex-col lg:justify-between xl:px-16 ${
          dark ? "bg-[#0b1220] text-white" : "bg-[#101828] text-white"
        }`}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage: dark
              ? "radial-gradient(circle at 25% 20%, #475467 0, transparent 45%), radial-gradient(circle at 80% 75%, #3b5bdb 0, transparent 40%)"
              : "radial-gradient(circle at 20% 15%, #3b5bdb 0, transparent 45%), radial-gradient(circle at 85% 80%, #475467 0, transparent 40%)",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
            <FileStack className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.01em]">Document Management</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-[27px] font-semibold leading-tight tracking-[-0.02em]">{panelTitle}</h2>
          <ul className="mt-7 space-y-3.5">
            {panelPoints.map((point) => (
              <li key={point} className="flex gap-3 text-[13.5px] leading-relaxed text-white/70">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-white/50" strokeWidth={1.75} />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[12px] text-white/40">
          Storage credentials stay in your environment — the platform stores references only.
        </p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[420px] animate-rise">
          <div className="mb-7 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)] text-white">
              <FileStack className="h-4 w-4" />
            </span>
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {eyebrow}
          </p>
          <h1 className="mt-1 text-[22px] font-semibold tracking-[-0.02em] text-[var(--text)]">{heading}</h1>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">{description}</p>

          <div className="mt-6">{children}</div>

          {footer && <div className="mt-6">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

/** Collapsible identity-token input, needed only when the API enforces token auth. */
export function TokenField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12.5px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text)]"
      >
        <KeyRound className="h-3.5 w-3.5" />
        Identity token
        <span className="ml-auto text-[11.5px] font-normal text-[var(--text-muted)]">
          {open ? "Hide" : "Optional"}
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--border)] p-3">
          <Input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Paste your JWT"
            mono
            hint="Required only when the API enforces token authentication."
          />
        </div>
      )}
    </div>
  );
}
