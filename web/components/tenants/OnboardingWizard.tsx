"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  HardDrive,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { CopyButton } from "@/components/ui/Copy";
import { StorageConfigFields, type StorageErrors } from "./StorageConfigFields";
import { HandoverDetails, workspaceSignInLink } from "./HandoverDetails";
import { ProviderMark } from "./ProviderMark";
import { tenantsApi } from "@/lib/api";
import type { ProviderType, Tenant } from "@/lib/types";
import {
  PROVIDER_SPECS,
  buildStoragePayload,
  cn,
  emptyStorageForm,
  formatBytes,
  providerLabel,
  slugify,
  validateStorageForm,
  type StorageFormValues,
} from "@/lib/utils";

const SIZE_OPTIONS = [
  { value: String(10 * 1024 * 1024), label: "10 MB" },
  { value: String(25 * 1024 * 1024), label: "25 MB" },
  { value: String(50 * 1024 * 1024), label: "50 MB" },
  { value: String(100 * 1024 * 1024), label: "100 MB" },
  { value: String(512 * 1024 * 1024), label: "512 MB" },
  { value: String(1024 * 1024 * 1024), label: "1 GB" },
];

const MIME_PRESETS = [
  {
    id: "documents",
    label: "Documents",
    detail: "PDF, plain text",
    types: ["application/pdf", "text/plain"],
    icon: FileText,
  },
  {
    id: "office",
    label: "Office files",
    detail: "Word, Excel",
    types: [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    icon: FileSpreadsheet,
  },
  {
    id: "images",
    label: "Images",
    detail: "PNG, JPEG, WebP",
    types: ["image/png", "image/jpeg", "image/webp"],
    icon: FileImage,
  },
  {
    id: "archives",
    label: "Archives",
    detail: "ZIP",
    types: ["application/zip"],
    icon: FileArchive,
  },
];

const STEPS = [
  { id: 1, label: "Organisation", hint: "Name, owner and limits", icon: Building2 },
  { id: 2, label: "Storage", hint: "Provider and credentials", icon: HardDrive },
  { id: 3, label: "Review", hint: "Confirm and create", icon: ListChecks },
];

interface ProfileForm {
  name: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  maxFileSizeBytes: string;
  presets: string[];
  restrictTypes: boolean;
}

const emptyProfile: ProfileForm = {
  name: "",
  slug: "",
  ownerName: "",
  ownerEmail: "",
  maxFileSizeBytes: String(50 * 1024 * 1024),
  presets: ["documents", "images"],
  restrictTypes: true,
};

/** Guided tenant onboarding: organisation → storage → review → handover details. */
export function OnboardingWizard({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (tenant: Tenant) => void;
}) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [profile, setProfile] = useState<ProfileForm>(emptyProfile);
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState<ProviderType>("s3");
  const [storage, setStorage] = useState<StorageFormValues>({ ...emptyStorageForm, region: "us-east-1" });
  const [storageErrors, setStorageErrors] = useState<StorageErrors>({});
  const [created, setCreated] = useState<Tenant | null>(null);

  const derivedSlug = profile.slug.trim() ? slugify(profile.slug) : slugify(profile.name);

  const allowedMimeTypes = useMemo(() => {
    if (!profile.restrictTypes) return null;
    const types = MIME_PRESETS.filter((preset) => profile.presets.includes(preset.id)).flatMap(
      (preset) => preset.types
    );
    return types.length ? [...new Set(types)] : null;
  }, [profile.presets, profile.restrictTypes]);

  const reset = () => {
    setStep(1);
    setProfile(emptyProfile);
    setProfileErrors({});
    setProvider("s3");
    setStorage({ ...emptyStorageForm, region: "us-east-1" });
    setStorageErrors({});
    setCreated(null);
  };

  const close = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const validateProfile = () => {
    const errors: Record<string, string> = {};
    if (!profile.name.trim()) errors.name = "Organisation name is required";
    if (!derivedSlug) errors.slug = "Workspace ID is required";
    else if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(derivedSlug))
      errors.slug = "Use lowercase letters, digits and hyphens";
    if (!profile.ownerEmail.trim()) errors.ownerEmail = "Owner email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(profile.ownerEmail.trim()))
      errors.ownerEmail = "Enter a valid email address";
    setProfileErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const goToStep = (target: number) => {
    if (target === step) return;
    if (target > 1 && !validateProfile()) {
      setStep(1);
      return;
    }
    if (target > 2) {
      const errors = validateStorageForm(provider, storage);
      setStorageErrors(errors);
      if (Object.keys(errors).length > 0) {
        setStep(2);
        toast.error("Fix the highlighted storage fields");
        return;
      }
    }
    setStep(target);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const result = await tenantsApi.create({
        name: profile.name.trim(),
        slug: derivedSlug,
        ownerName: profile.ownerName.trim() || null,
        ownerEmail: profile.ownerEmail.trim(),
        maxFileSizeBytes: Number(profile.maxFileSizeBytes),
        allowedMimeTypes,
        storage: buildStoragePayload(provider, storage),
      });
      setCreated(result.tenant);
      onCreated(result.tenant);
      toast.success(`${result.tenant.name} is ready`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Onboarding failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (created) {
    return (
      <Dialog
        open={open}
        onClose={close}
        size="lg"
        title="Workspace ready"
        description="Share these details with the customer. They stay available on the tenant page."
        icon={
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#abefc6] bg-[var(--success-soft)] text-[var(--success)]">
            <Check className="h-4 w-4" />
          </span>
        }
        footer={
          <Button size="sm" onClick={close}>
            Done
          </Button>
        }
      >
        <div className="space-y-4">
          <HandoverDetails tenant={created} storage={{ provider, container: storage.container }} />

          <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <ProviderMark provider={provider} />
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-[var(--text)]">{providerLabel(provider)}</p>
                <p className="truncate text-[12px] text-[var(--text-secondary)]">
                  {storage.container}
                  {storage.basePrefix ? ` · prefix ${storage.basePrefix}` : ""}
                </p>
              </div>
            </div>
            <Badge tone="success" dot>
              Attached
            </Badge>
          </div>

          <p className="text-[11.5px] leading-relaxed text-[var(--text-muted)]">
            The owner opens the sign-in link and uses their email address to become the workspace
            administrator. Anyone else who signs in to this workspace joins as a member and only sees
            documents shared with them.
          </p>
        </div>
      </Dialog>
    );
  }

  const currentStep = STEPS[step - 1];

  return (
    <Dialog
      open={open}
      onClose={close}
      size="full"
      title="Onboard a tenant"
      description="Create the workspace and attach its storage in one flow."
      footer={
        <>
          {step > 1 ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setStep(step - 1)}
              disabled={submitting}
              leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}
            >
              Back
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={close}>
              Cancel
            </Button>
          )}
          {step < 3 ? (
            <Button size="sm" onClick={() => goToStep(step + 1)} rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
              Continue
            </Button>
          ) : (
            <Button size="sm" loading={submitting} onClick={() => void submit()}>
              Create tenant
            </Button>
          )}
        </>
      }
    >
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col">
        {/* Horizontal, full-width stepper. */}
        <nav aria-label="Onboarding progress" className="mb-6">
          <ol className="grid gap-3 sm:grid-cols-3">
            {STEPS.map((entry) => {
              const state = step === entry.id ? "current" : step > entry.id ? "done" : "upcoming";
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => goToStep(entry.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                      state === "current"
                        ? "border-[var(--accent-border)] bg-[var(--accent-soft)]"
                        : "border-[var(--border)] bg-white hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold",
                        state === "current" && "border-[var(--accent)] bg-[var(--accent)] text-white",
                        state === "done" && "border-[#abefc6] bg-[var(--success-soft)] text-[var(--success)]",
                        state === "upcoming" && "border-[var(--border)] bg-white text-[var(--text-muted)]"
                      )}
                    >
                      {state === "done" ? <Check className="h-3.5 w-3.5" /> : entry.id}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block truncate text-[13px] font-semibold",
                          state === "upcoming" ? "text-[var(--text-muted)]" : "text-[var(--text)]"
                        )}
                      >
                        {entry.label}
                      </span>
                      <span className="block truncate text-[11.5px] text-[var(--text-secondary)]">
                        {entry.hint}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0 flex-1">
          <header className="mb-5 flex items-center gap-2.5 border-b border-[var(--border)] pb-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
              <currentStep.icon className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-[15px] font-semibold text-[var(--text)]">{currentStep.label}</h3>
              <p className="text-[12.5px] text-[var(--text-secondary)]">{currentStep.hint}</p>
            </div>
          </header>

          {step === 1 && (
            <div className="space-y-5">
              <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
                <Input
                  label="Organisation name"
                  value={profile.name}
                  onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                  placeholder="Acme Corporation"
                  error={profileErrors.name}
                  required
                  autoFocus
                />
                <Input
                  label="Workspace ID"
                  value={profile.slug}
                  onChange={(event) => setProfile({ ...profile, slug: event.target.value })}
                  placeholder={derivedSlug || "acme"}
                  hint="Internal short name. Derived from the organisation name."
                  error={profileErrors.slug}
                  mono
                />
                <Input
                  label="Owner name"
                  value={profile.ownerName}
                  onChange={(event) => setProfile({ ...profile, ownerName: event.target.value })}
                  placeholder="Jane Doe"
                />
                <Input
                  label="Owner email"
                  type="email"
                  value={profile.ownerEmail}
                  onChange={(event) => setProfile({ ...profile, ownerEmail: event.target.value })}
                  placeholder="jane@acme.com"
                  hint="Signs in as the workspace administrator."
                  error={profileErrors.ownerEmail}
                  required
                />
              </div>

              <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3.5 py-3 text-[12px] leading-relaxed text-[var(--text-secondary)]">
                The customer sign-in link is generated after the tenant is created, because it uses the
                tenant ID rather than the workspace slug.
              </div>

              <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
                <Select
                  label="Maximum file size"
                  value={profile.maxFileSizeBytes}
                  onChange={(event) => setProfile({ ...profile, maxFileSizeBytes: event.target.value })}
                  options={SIZE_OPTIONS}
                  hint="Applies to every upload in this tenant."
                />
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--text)]">Allowed file types</p>
                    <p className="text-[12px] text-[var(--text-secondary)]">
                      Uploads outside the selection are rejected by the API.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={!profile.restrictTypes}
                      onChange={(event) => setProfile({ ...profile, restrictTypes: !event.target.checked })}
                      className="h-3.5 w-3.5 rounded border-[var(--border-strong)]"
                    />
                    Allow all types
                  </label>
                </div>
                <div className={cn("grid gap-2 sm:grid-cols-2", !profile.restrictTypes && "opacity-50")}>
                  {MIME_PRESETS.map((preset) => {
                    const selected = profile.presets.includes(preset.id);
                    const TypeIcon = preset.icon;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        disabled={!profile.restrictTypes}
                        onClick={() =>
                          setProfile({
                            ...profile,
                            presets: selected
                              ? profile.presets.filter((id) => id !== preset.id)
                              : [...profile.presets, preset.id],
                          })
                        }
                        className={cn(
                          "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                          selected
                            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                            : "border-[var(--border)] bg-white hover:bg-[var(--surface-muted)]"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                            selected
                              ? "border-[var(--accent-border)] bg-white text-[var(--accent)]"
                              : "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]"
                          )}
                        >
                          <TypeIcon className="h-4 w-4" strokeWidth={1.8} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] font-medium text-[var(--text)]">
                            {preset.label}
                          </span>
                          <span className="block truncate text-[11px] text-[var(--text-muted)]">
                            {preset.detail}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            selected
                              ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                              : "border-[var(--border-strong)] bg-white"
                          )}
                        >
                          {selected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <StorageConfigFields
              provider={provider}
              onProviderChange={(next) => {
                setProvider(next);
                setStorageErrors({});
                setStorage((current) => ({
                  ...emptyStorageForm,
                  container: current.container,
                  basePrefix: current.basePrefix,
                  signedUrlTtlSeconds: current.signedUrlTtlSeconds,
                  region: next === "s3" ? current.region || "us-east-1" : current.region,
                }));
              }}
              values={storage}
              onChange={setStorage}
              errors={storageErrors}
            />
          )}

          {step === 3 && (
            <div className="space-y-3">
              <ReviewGroup
                title="Organisation"
                onEdit={() => setStep(1)}
                rows={[
                  { label: "Name", value: profile.name },
                  { label: "Workspace ID", value: derivedSlug, mono: true },
                  { label: "Sign-in link", value: "Generated after tenant creation" },
                  { label: "Owner", value: `${profile.ownerName || "—"} · ${profile.ownerEmail}` },
                  { label: "Maximum file size", value: formatBytes(Number(profile.maxFileSizeBytes)) },
                  {
                    label: "Allowed types",
                    value: allowedMimeTypes ? `${allowedMimeTypes.length} MIME types` : "All types",
                  },
                ]}
              />
              <ReviewGroup
                title={PROVIDER_SPECS[provider].label}
                badge={<ProviderMark provider={provider} size="sm" />}
                onEdit={() => setStep(2)}
                rows={[...PROVIDER_SPECS[provider].connection, ...PROVIDER_SPECS[provider].credentials]
                  .filter((field) => {
                    const value = storage[field.name];
                    return field.type === "toggle" ? true : String(value ?? "").trim() !== "";
                  })
                  .map((field) => ({
                    label: field.label,
                    value:
                      field.type === "toggle"
                        ? storage[field.name]
                          ? "Enabled"
                          : "Disabled"
                        : String(storage[field.name]),
                    mono: field.mono,
                  }))}
              />
              <p className="text-[11.5px] leading-relaxed text-[var(--text-muted)]">
                The workspace and its storage target are validated together. Nothing is saved if
                validation fails.
              </p>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function SummaryLine({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <p className={cn("truncate text-[12px] text-[var(--text)]", mono && "font-mono text-[11.5px]")}>
        {value}
      </p>
    </div>
  );
}

function ReviewGroup({
  title,
  badge,
  onEdit,
  rows,
}: {
  title: string;
  badge?: React.ReactNode;
  onEdit?: () => void;
  rows: Array<{ label: string; value: string; mono?: boolean }>;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)]">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2">
        <h3 className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--text)]">
          {badge}
          {title}
        </h3>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-[11.5px] font-medium text-[var(--accent)] hover:underline"
          >
            Edit
          </button>
        )}
      </header>
      <dl className="divide-y divide-[var(--border)]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 px-3.5 py-2">
            <dt className="shrink-0 text-[12px] text-[var(--text-secondary)]">{row.label}</dt>
            <dd className="flex min-w-0 items-center gap-1">
              <span
                className={cn(
                  "truncate text-[12.5px] text-[var(--text)]",
                  row.mono && "font-mono text-[12px]"
                )}
                title={row.value}
              >
                {row.value}
              </span>
              {row.mono && <CopyButton value={row.value} className="h-6 w-6" />}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
