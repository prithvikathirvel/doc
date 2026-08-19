"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Check, Download, HardDrive, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { CopyButton, CopyRow } from "@/components/ui/Copy";
import { StorageConfigFields, type StorageErrors } from "./StorageConfigFields";
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
  { id: "documents", label: "Documents", types: ["application/pdf", "text/plain"] },
  {
    id: "office",
    label: "Office files",
    types: [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
  },
  { id: "images", label: "Images", types: ["image/png", "image/jpeg", "image/webp"] },
  { id: "archives", label: "Archives", types: ["application/zip"] },
];

const STEPS = [
  { id: 1, label: "Organisation", icon: Building2 },
  { id: 2, label: "Storage", icon: HardDrive },
  { id: 3, label: "Review", icon: ShieldCheck },
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
    if (!derivedSlug) errors.slug = "Workspace URL is required";
    else if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(derivedSlug))
      errors.slug = "Use lowercase letters, digits and hyphens";
    if (!profile.ownerEmail.trim()) errors.ownerEmail = "Owner email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(profile.ownerEmail.trim()))
      errors.ownerEmail = "Enter a valid email address";
    setProfileErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const goNext = () => {
    if (step === 1) {
      if (!validateProfile()) return;
      setStep(2);
      return;
    }
    if (step === 2) {
      const errors = validateStorageForm(provider, storage);
      setStorageErrors(errors);
      if (Object.keys(errors).length > 0) {
        toast.error("Fix the highlighted storage fields");
        return;
      }
      setStep(3);
    }
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

  const handoverText = created
    ? [
        `Workspace: ${created.name}`,
        `Workspace URL: ${created.slug}`,
        `Tenant ID: ${created.id}`,
        `Owner: ${created.ownerName || "—"} <${created.ownerEmail || "—"}>`,
        `Sign-in: ${typeof window !== "undefined" ? window.location.origin : ""}/login`,
        `Storage: ${providerLabel(provider)} · ${storage.container}`,
        `Maximum file size: ${formatBytes(created.maxFileSizeBytes)}`,
      ].join("\n")
    : "";

  const downloadHandover = () => {
    if (!created) return;
    const blob = new Blob([handoverText], { type: "text/plain" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${created.slug}-workspace-details.txt`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };

  if (created) {
    return (
      <Dialog
        open={open}
        onClose={close}
        size="lg"
        title="Workspace ready"
        description="Share these details with the customer. They are shown once here and remain on the tenant page."
        icon={
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#abefc6] bg-[var(--success-soft)] text-[var(--success)]">
            <Check className="h-4 w-4" />
          </span>
        }
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={downloadHandover}
              leftIcon={<Download className="h-3.5 w-3.5" />}
            >
              Download details
            </Button>
            <Button size="sm" onClick={close}>
              Done
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <CopyRow label="Tenant ID" value={created.id} />
            <CopyRow label="Workspace URL" value={created.slug} />
            <CopyRow label="Owner sign-in" value={created.ownerEmail || "—"} mono={false} />
            <CopyRow
              label="Sign-in page"
              value={typeof window !== "undefined" ? `${window.location.origin}/login` : "/login"}
              mono={false}
            />
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[12.5px] font-medium text-[var(--text)]">Storage attached</p>
                <p className="mt-0.5 text-[12px] text-[var(--text-secondary)]">
                  {providerLabel(provider)} · {storage.container}
                  {storage.basePrefix ? ` · prefix ${storage.basePrefix}` : ""}
                </p>
              </div>
              <Badge tone="success" dot>
                Active
              </Badge>
            </div>
          </div>
          <p className="text-[11.5px] leading-relaxed text-[var(--text-muted)]">
            The owner signs in on the tenant workspace tab using the workspace URL and their email
            address. Everyone else who signs in with that workspace joins as a member and only sees
            documents shared with them.
          </p>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      title="Onboard a tenant"
      description="Create the workspace and attach its storage in one flow."
      footer={
        <>
          {step > 1 ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setStep((value) => value - 1)}
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
            <Button size="sm" onClick={goNext} rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
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
      <ol className="mb-5 flex items-center gap-2">
        {STEPS.map((entry, index) => {
          const state = step === entry.id ? "current" : step > entry.id ? "done" : "upcoming";
          return (
            <li key={entry.id} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold",
                  state === "current" && "border-[var(--accent)] bg-[var(--accent)] text-white",
                  state === "done" && "border-[#abefc6] bg-[var(--success-soft)] text-[var(--success)]",
                  state === "upcoming" && "border-[var(--border)] bg-white text-[var(--text-muted)]"
                )}
              >
                {state === "done" ? <Check className="h-3.5 w-3.5" /> : entry.id}
              </span>
              <span
                className={cn(
                  "hidden text-[12.5px] font-medium sm:block",
                  state === "upcoming" ? "text-[var(--text-muted)]" : "text-[var(--text)]"
                )}
              >
                {entry.label}
              </span>
              {index < STEPS.length - 1 && <span className="h-px flex-1 bg-[var(--border)]" />}
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
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
              label="Workspace URL"
              value={profile.slug}
              onChange={(event) => setProfile({ ...profile, slug: event.target.value })}
              placeholder={derivedSlug || "acme"}
              hint={derivedSlug ? `Users sign in with “${derivedSlug}”` : "Derived from the name"}
              error={profileErrors.slug}
              mono
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
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
              hint="This address signs in as the workspace administrator."
              error={profileErrors.ownerEmail}
              required
            />
          </div>

          <Select
            label="Maximum file size"
            value={profile.maxFileSizeBytes}
            onChange={(event) => setProfile({ ...profile, maxFileSizeBytes: event.target.value })}
            options={SIZE_OPTIONS}
            hint="Applies to every upload in this tenant."
          />

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[12.5px] font-medium text-[var(--text-secondary)]">Allowed file types</p>
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
                      "rounded-lg border px-3 py-2.5 text-left transition-colors",
                      selected
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-[var(--border)] bg-white hover:bg-[var(--surface-muted)]"
                    )}
                  >
                    <span className="block text-[12.5px] font-medium text-[var(--text)]">
                      {preset.label}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-[var(--text-muted)]">
                      {preset.types.length} MIME types
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
            rows={[
              { label: "Name", value: profile.name },
              { label: "Workspace URL", value: derivedSlug },
              { label: "Owner", value: `${profile.ownerName || "—"} · ${profile.ownerEmail}` },
              { label: "Maximum file size", value: formatBytes(Number(profile.maxFileSizeBytes)) },
              {
                label: "Allowed types",
                value: allowedMimeTypes ? `${allowedMimeTypes.length} MIME types` : "All types",
              },
            ]}
          />
          <ReviewGroup
            title={`Storage · ${PROVIDER_SPECS[provider].label}`}
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
            The workspace is created and the storage target is validated in a single step. Nothing is
            saved if validation fails.
          </p>
        </div>
      )}
    </Dialog>
  );
}

function ReviewGroup({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string; mono?: boolean }>;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)]">
      <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2">
        <h3 className="text-[12.5px] font-semibold text-[var(--text)]">{title}</h3>
      </header>
      <dl className="divide-y divide-[var(--border)]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 px-3.5 py-2">
            <dt className="text-[12px] text-[var(--text-secondary)]">{row.label}</dt>
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
