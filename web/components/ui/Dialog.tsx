"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  toneIcon,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  toneIcon?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const widths = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-3xl",
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[4px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-[0_25px_50px_-12px_rgba(15,23,42,0.25)] sm:rounded-2xl animate-fade-up",
          widths[size]
        )}
      >
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          {toneIcon}
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold tracking-tight text-slate-800">{title}</h2>
            {description && (
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-500">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children && <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>}
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-3.5 sm:flex-row sm:justify-end">
            {footer}
          </div>
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
  tone = "info",
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: "danger" | "warning" | "info";
  loading?: boolean;
}) {
  const tones = {
    danger: {
      wrap: "bg-red-50 text-red-600 border-red-100",
      btn: "danger" as const,
    },
    warning: {
      wrap: "bg-amber-50 text-amber-600 border-amber-100",
      btn: "primary" as const,
    },
    info: {
      wrap: "bg-indigo-50 text-indigo-600 border-indigo-100",
      btn: "primary" as const,
    },
  };
  const t = tones[tone];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      toneIcon={
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
            t.wrap
          )}
        >
          <span className="text-sm font-bold">!</span>
        </div>
      }
      footer={
        <>
          <Button variant="outlined" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={t.btn}
            size="sm"
            onClick={onConfirm}
            loading={loading}
            className={tone === "warning" ? "bg-amber-600 hover:bg-amber-700" : undefined}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
