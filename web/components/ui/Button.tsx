"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "outlined" | "text" | "danger" | "ghost" | "dark";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-[#4f46e5] text-white border border-transparent shadow-[0_1px_2px_0_rgba(79,70,229,0.2)] hover:bg-[#4338ca] hover:shadow-[0_2px_4px_0_rgba(79,70,229,0.25)] disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none disabled:opacity-60",
  outlined:
    "bg-white text-slate-700 border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 disabled:border-slate-100 disabled:text-slate-300",
  text: "bg-transparent text-slate-600 border border-transparent hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-300",
  danger:
    "bg-red-600 text-white border border-transparent shadow-xs hover:bg-red-700 disabled:bg-slate-100 disabled:text-slate-400",
  ghost:
    "bg-white text-slate-700 border border-slate-200 rounded-xl font-semibold hover:bg-slate-50",
  dark: "bg-slate-900 text-white border border-transparent rounded-xl font-semibold hover:bg-slate-800",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-4 text-[13px] gap-2",
  lg: "h-[42px] px-5 text-sm gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading,
      disabled,
      leftIcon,
      rightIcon,
      children,
      type = "button",
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-medium tracking-[-0.01em] transition-all duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] disabled:cursor-not-allowed whitespace-nowrap",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> : leftIcon}
        {children}
        {!loading && rightIcon}
      </button>
    );
  }
);
Button.displayName = "Button";
