"use client";

import { Info } from "lucide-react";
import { Input, RadioCard, Toggle } from "@/components/ui/Input";
import type { ProviderType } from "@/lib/types";
import {
  PROVIDER_LIST,
  PROVIDER_SPECS,
  type StorageFormValues,
  type ProviderFieldSpec,
} from "@/lib/utils";

export type StorageErrors = Partial<Record<keyof StorageFormValues, string>>;

/**
 * Renders only the fields the selected provider actually uses, in two groups:
 * connection details and credential references.
 */
export function StorageConfigFields({
  provider,
  onProviderChange,
  values,
  onChange,
  errors,
  showProviderPicker = true,
}: {
  provider: ProviderType;
  onProviderChange: (provider: ProviderType) => void;
  values: StorageFormValues;
  onChange: (values: StorageFormValues) => void;
  errors: StorageErrors;
  showProviderPicker?: boolean;
}) {
  const spec = PROVIDER_SPECS[provider];

  const renderField = (field: ProviderFieldSpec) => {
    if (field.type === "toggle") {
      return (
        <Toggle
          key={field.name}
          label={field.label}
          hint={field.hint}
          checked={Boolean(values[field.name])}
          onChange={(next) => onChange({ ...values, [field.name]: next })}
        />
      );
    }
    return (
      <Input
        key={field.name}
        label={field.label}
        placeholder={field.placeholder}
        hint={field.hint}
        required={field.required}
        mono={field.mono}
        type={field.type === "number" ? "number" : "text"}
        inputMode={field.type === "number" ? "numeric" : undefined}
        value={String(values[field.name] ?? "")}
        error={errors[field.name]}
        onChange={(event) =>
          onChange({
            ...values,
            [field.name]:
              field.type === "number" ? Number(event.target.value) || 0 : event.target.value,
          })
        }
      />
    );
  };

  return (
    <div className="space-y-5">
      {showProviderPicker && (
        <div>
          <p className="mb-2 text-[12.5px] font-medium text-[var(--text-secondary)]">
            Storage provider <span className="text-[var(--danger)]">*</span>
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {PROVIDER_LIST.map((option) => (
              <RadioCard
                key={option.id}
                selected={provider === option.id}
                onSelect={() => onProviderChange(option.id)}
                title={option.label}
                description={option.summary}
              />
            ))}
          </div>
        </div>
      )}

      <section>
        <h3 className="text-[13px] font-semibold text-[var(--text)]">Connection</h3>
        <p className="mt-0.5 text-[12px] text-[var(--text-secondary)]">
          Where documents for this tenant are stored.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{spec.connection.map(renderField)}</div>
      </section>

      <section>
        <h3 className="text-[13px] font-semibold text-[var(--text)]">Credentials</h3>
        <p className="mt-0.5 text-[12px] text-[var(--text-secondary)]">
          Enter the <span className="font-medium text-[var(--text)]">name</span> of the environment
          variable that holds each secret. Values are read by the API at runtime.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{spec.credentials.map(renderField)}</div>
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          <p className="text-[11.5px] leading-relaxed text-[var(--text-secondary)]">
            Secrets are never stored in the database. Set the variables in the API environment and
            restart the service after changing them. Field-by-field reference with sample values:{" "}
            <span className="font-mono">docs/STORAGE_CONFIGURATION.md</span>.
          </p>
        </div>
      </section>
    </div>
  );
}
