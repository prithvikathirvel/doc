"use client";

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, error, leftIcon, id, ...props }, ref) => {
    const inputId = id || props.name;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-xs font-semibold tracking-tight text-slate-700"
          >
            {label}
            {props.required && <span className="ml-0.5 text-red-500">*</span>}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "h-[38px] w-full rounded-lg border bg-white px-3 text-[13px] text-slate-900 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] placeholder:text-[#94a3b8] transition-all duration-150",
              "hover:border-slate-300",
              "focus:border-blue-600 focus:outline-none focus:ring-[3px] focus:ring-blue-600/15",
              error
                ? "border-red-500 focus:border-red-500 focus:ring-red-500/15"
                : "border-slate-200",
              "disabled:bg-slate-50 disabled:opacity-60",
              leftIcon && "pl-9",
              className
            )}
            {...props}
          />
        </div>
        {error ? (
          <p className="mt-1 text-[11px] font-medium text-red-600">{error}</p>
        ) : hint ? (
          <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = "Input";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, hint, error, id, ...props }, ref) => {
    const inputId = id || props.name;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-xs font-semibold tracking-tight text-slate-700"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={cn(
            "min-h-[88px] w-full rounded-lg border bg-white px-3 py-2 text-[13px] text-slate-900 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] placeholder:text-[#94a3b8] transition-all duration-150",
            "hover:border-slate-300 focus:border-blue-600 focus:outline-none focus:ring-[3px] focus:ring-blue-600/15",
            error ? "border-red-500" : "border-slate-200",
            className
          )}
          {...props}
        />
        {error ? (
          <p className="mt-1 text-[11px] font-medium text-red-600">{error}</p>
        ) : hint ? (
          <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
        ) : null}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, hint, error, options, id, ...props }, ref) => {
    const inputId = id || props.name;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-xs font-semibold tracking-tight text-slate-700"
          >
            {label}
            {props.required && <span className="ml-0.5 text-red-500">*</span>}
          </label>
        )}
        <select
          ref={ref}
          id={inputId}
          className={cn(
            "h-[38px] w-full appearance-none rounded-lg border bg-white px-3 text-[13px] text-slate-900 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] transition-all duration-150",
            "hover:border-slate-300 focus:border-blue-600 focus:outline-none focus:ring-[3px] focus:ring-blue-600/15",
            error ? "border-red-500" : "border-slate-200",
            className
          )}
          {...props}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {error ? (
          <p className="mt-1 text-[11px] font-medium text-red-600">{error}</p>
        ) : hint ? (
          <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
        ) : null}
      </div>
    );
  }
);
Select.displayName = "Select";
