"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const controlBase =
  "w-full rounded-lg border bg-white text-[13px] text-[var(--text)] shadow-[var(--shadow-xs)] transition-colors placeholder:text-[var(--text-muted)] hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:outline-none focus:ring-[3px] focus:ring-[var(--accent)]/12 disabled:bg-slate-50 disabled:text-slate-400";

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
  action,
}: {
  label?: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn("w-full min-w-0", className)}>
      {label && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-[var(--text-secondary)]">
            {label}
            {required && <span className="ml-0.5 text-[var(--danger)]">*</span>}
          </label>
          {action}
        </div>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-[11.5px] font-medium text-[var(--danger)]">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: ReactNode;
  error?: string;
  leftIcon?: ReactNode;
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, error, leftIcon, mono, id, ...props },
  ref
) {
  const inputId = id || props.name;
  return (
    <Field label={label} hint={hint} error={error} required={props.required} htmlFor={inputId}>
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--text-muted)]">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            controlBase,
            "h-10 px-3",
            leftIcon && "pl-9",
            mono && "font-mono text-[12.5px]",
            error ? "border-[#fda29b] focus:border-[var(--danger)] focus:ring-[var(--danger)]/12" : "border-[var(--border)]",
            className
          )}
          {...props}
        />
      </div>
    </Field>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: ReactNode;
  error?: string;
  options: Array<{ value: string; label: string }>;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, label, hint, error, options, id, ...props },
  ref
) {
  const inputId = id || props.name;
  return (
    <Field label={label} hint={hint} error={error} required={props.required} htmlFor={inputId}>
      <div className="relative">
        <select
          ref={ref}
          id={inputId}
          className={cn(
            controlBase,
            "h-10 appearance-none pl-3 pr-9",
            error ? "border-[#fda29b]" : "border-[var(--border)]",
            className
          )}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
      </div>
    </Field>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: ReactNode;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, label, hint, error, id, ...props },
  ref
) {
  const inputId = id || props.name;
  return (
    <Field label={label} hint={hint} error={error} required={props.required} htmlFor={inputId}>
      <textarea
        ref={ref}
        id={inputId}
        className={cn(
          controlBase,
          "min-h-[84px] px-3 py-2.5",
          error ? "border-[#fda29b]" : "border-[var(--border)]",
          className
        )}
        {...props}
      />
    </Field>
  );
});

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-[var(--border)] bg-white px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium text-[var(--text)]">{label}</p>
        {hint && <p className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50",
          checked ? "bg-[var(--accent)]" : "bg-slate-300"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
            checked ? "left-[18px]" : "left-0.5"
          )}
        />
      </button>
    </div>
  );
}

export function RadioCard({
  selected,
  onSelect,
  title,
  description,
  meta,
  disabled,
}: {
  selected: boolean;
  onSelect: () => void;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all",
        selected
          ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[var(--shadow-xs)]"
          : "border-[var(--border)] bg-white hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
          selected ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border-strong)] bg-white"
        )}
      >
        {selected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-[var(--text)]">{title}</span>
        {description && (
          <span className="mt-0.5 block text-[12px] leading-relaxed text-[var(--text-secondary)]">
            {description}
          </span>
        )}
        {meta}
      </span>
    </button>
  );
}
