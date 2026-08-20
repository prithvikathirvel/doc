"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

const widths = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
};

const sizeClass = {
  sm: widths.sm,
  md: widths.md,
  lg: widths.lg,
  xl: widths.xl,
  full: "h-[100dvh] sm:h-[calc(100dvh-2rem)] sm:max-w-[calc(100vw-2rem)]",
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  icon,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof sizeClass;
  icon?: ReactNode;
  dismissible?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissible) onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose, dismissible]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-fade"
        onClick={() => dismissible && onClose()}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-lg)] animate-rise sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl",
          sizeClass[size]
        )}
      >
        <header className="flex items-start gap-3 border-b border-[var(--border)] px-4 py-3.5 sm:px-5">
          {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text)]">{title}</h2>
            {description && (
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="-mr-1 rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-slate-100 hover:text-[var(--text)]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </header>
        {children && <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>}
        {footer && (
          <footer className="flex flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "default",
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: "default" | "danger";
  loading?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      dismissible={!loading}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            size="sm"
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
