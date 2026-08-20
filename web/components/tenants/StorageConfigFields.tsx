"use client";

import { Input, RadioCard, Toggle } from "@/components/ui/Input";
import { ProviderMark } from "./ProviderMark";
import type { ProviderType } from "@/lib/types";
import {
  PROVIDER_LIST,
  PROVIDER_SPECS,
  cn,
  type ProviderFieldSpec,
  type StorageFormValues,
} from "@/lib/utils";

export type StorageErrors = Partial<Record<keyof StorageFormValues, string>>;

/**
 * Provider-driven storage form.
 *
 * Everything rendered here comes from PROVIDER_SPECS, so adding a provider is a data
 * change: add its spec (and a mark in ProviderMark) and the picker, the field groups
 * and the validation follow automatically.
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
    <div className="space-y-6">
      {showProviderPicker && (
        <section>
          <SectionTitle
            title="Storage provider"
            description="Documents for this tenant are written to this target."
            required
          />
          <div className="grid gap-2.5 sm:grid-cols-2">
            {PROVIDER_LIST.map((option) => (
              <RadioCard
                key={option.id}
                selected={provider === option.id}
                onSelect={() => onProviderChange(option.id)}
                title={
                  <span className="flex items-center gap-2.5">
                    <ProviderMark provider={option.id} size="sm" />
                    {option.label}
                  </span>
                }
                description={option.summary}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle
          title="Connection"
          description={`Where ${spec.label} keeps this tenant's objects.`}
        />
        <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">{spec.connection.map(renderField)}</div>
      </section>

      <section>
        <SectionTitle
          title="Credentials"
          description="Enter the name of the environment variable that holds each secret, not the secret."
        />
        <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">{spec.credentials.map(renderField)}</div>
      </section>
    </div>
  );
}

function SectionTitle({
  title,
  description,
  required,
  className,
}: {
  title: string;
  description?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("mb-3", className)}>
      <h3 className="text-[13px] font-semibold text-[var(--text)]">
        {title}
        {required && <span className="ml-0.5 text-[var(--danger)]">*</span>}
      </h3>
      {description && (
        <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">{description}</p>
      )}
    </div>
  );
}
