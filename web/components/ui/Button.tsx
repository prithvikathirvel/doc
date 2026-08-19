"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--accent)] text-white border border-transparent shadow-[var(--shadow-xs)] hover:bg-[var(--accent-hover)] disabled:bg-slate-200 disabled:text-slate-400",
  secondary:
    "bg-white text-[var(--text-secondary)] border border-[var(--border)] shadow-[var(--shadow-xs)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] hover:border-[var(--border-strong)] disabled:text-slate-300",
  ghost:
    "bg-transparent text-[var(--text-secondary)] border border-transparent hover:bg-slate-100 hover:text-[var(--text)] disabled:text-slate-300",
  danger:
    "bg-[var(--danger)] text-white border border-transparent shadow-[var(--shadow-xs)] hover:bg-[#912018] disabled:bg-slate-200 disabled:text-slate-400",
  subtle:
    "bg-[var(--accent-soft)] text-[var(--accent-hover)] border border-[var(--accent-border)] hover:bg-[#e4eaff] disabled:opacity-60",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-2.5 text-[12.5px] gap-1.5 rounded-md",
  md: "h-9 px-3.5 text-[13px] gap-2 rounded-lg",
  lg: "h-11 px-5 text-[14px] gap-2 rounded-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = "primary",
    size = "md",
    loading,
    disabled,
    leftIcon,
    rightIcon,
    fullWidth,
    children,
    type = "button",
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center font-medium tracking-[-0.006em] transition-colors duration-150 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});

export function IconButton({
  label,
  children,
  tone = "default",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-[var(--text-muted)] transition-colors",
        tone === "danger"
          ? "hover:border-[#fecdca] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
          : "hover:border-[var(--border)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]",
        "disabled:pointer-events-none disabled:opacity-40",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
