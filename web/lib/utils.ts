import { clsx, type ClassValue } from "clsx";
import type { PermissionLevel, ProviderType, StorageConfigPayload } from "./types";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatBytes(bytes: number | null | undefined, decimals = 1): string {
  if (bytes == null || Number.isNaN(bytes)) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value < 10 && index > 0 ? value.toFixed(decimals) : Math.round(value)} ${units[index]}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat().format(value);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDay(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDate(date);
}

export function initials(name: string): string {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function truncate(value: string, max = 40): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: "Active",
    pending_upload: "Pending upload",
    soft_deleted: "In trash",
    failed: "Failed",
    suspended: "Suspended",
  };
  return labels[status] || status;
}

/* ── Storage providers ────────────────────────────────────────────── */

export interface ProviderFieldSpec {
  name: keyof StorageFormValues;
  label: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  mono?: boolean;
  type?: "text" | "number" | "toggle";
}

export interface StorageFormValues {
  container: string;
  region: string;
  endpoint: string;
  accessKeyRef: string;
  secretKeyRef: string;
  sessionTokenRef: string;
  projectId: string;
  accountName: string;
  credentialsJsonRef: string;
  basePrefix: string;
  useSsl: boolean;
  signedUrlTtlSeconds: number;
}

export const emptyStorageForm: StorageFormValues = {
  container: "",
  region: "",
  endpoint: "",
  accessKeyRef: "",
  secretKeyRef: "",
  sessionTokenRef: "",
  projectId: "",
  accountName: "",
  credentialsJsonRef: "",
  basePrefix: "",
  useSsl: true,
  signedUrlTtlSeconds: 900,
};

export interface ProviderSpec {
  id: ProviderType;
  label: string;
  summary: string;
  connection: ProviderFieldSpec[];
  credentials: ProviderFieldSpec[];
}

const PREFIX_FIELD: ProviderFieldSpec = {
  name: "basePrefix",
  label: "Object prefix",
  placeholder: "dms",
  hint: "Optional folder prefix applied to every stored object.",
};

const TTL_FIELD: ProviderFieldSpec = {
  name: "signedUrlTtlSeconds",
  label: "Signed URL lifetime",
  type: "number",
  hint: "Seconds a download or upload link stays valid (60–86400).",
};

/**
 * Mirrors the provider specification exposed by the API. Only the fields listed
 * here are shown and submitted for the selected provider.
 */
export const PROVIDER_SPECS: Record<ProviderType, ProviderSpec> = {
  s3: {
    id: "s3",
    label: "Amazon S3",
    summary: "Managed object storage on AWS with IAM or key-based access.",
    connection: [
      { name: "container", label: "Bucket name", placeholder: "acme-documents", required: true },
      { name: "region", label: "Region", placeholder: "us-east-1", required: true },
      {
        name: "endpoint",
        label: "Custom endpoint",
        placeholder: "https://s3.eu-central-1.amazonaws.com",
        hint: "Only for S3-compatible gateways. Leave empty for AWS.",
      },
      PREFIX_FIELD,
      TTL_FIELD,
    ],
    credentials: [
      {
        name: "accessKeyRef",
        label: "Access key reference",
        placeholder: "ACME_AWS_ACCESS_KEY",
        mono: true,
        hint: "Leave both key fields empty to use the instance IAM role.",
      },
      { name: "secretKeyRef", label: "Secret key reference", placeholder: "ACME_AWS_SECRET_KEY", mono: true },
      {
        name: "sessionTokenRef",
        label: "Session token reference",
        placeholder: "ACME_AWS_SESSION_TOKEN",
        mono: true,
        hint: "Only for temporary STS credentials.",
      },
    ],
  },
  minio: {
    id: "minio",
    label: "MinIO",
    summary: "Self-hosted S3-compatible storage running in your own network.",
    connection: [
      { name: "container", label: "Bucket name", placeholder: "documents", required: true },
      {
        name: "endpoint",
        label: "Endpoint URL",
        placeholder: "https://minio.internal:9000",
        required: true,
        hint: "TLS follows the scheme: https enables it, http disables it.",
      },
      { name: "region", label: "Region", placeholder: "us-east-1" },
      PREFIX_FIELD,
      TTL_FIELD,
    ],
    credentials: [
      {
        name: "accessKeyRef",
        label: "Access key reference",
        placeholder: "MINIO_ACCESS_KEY",
        required: true,
        mono: true,
      },
      {
        name: "secretKeyRef",
        label: "Secret key reference",
        placeholder: "MINIO_SECRET_KEY",
        required: true,
        mono: true,
      },
    ],
  },
  gcp: {
    id: "gcp",
    label: "Google Cloud Storage",
    summary: "Buckets on Google Cloud using a service account or workload identity.",
    connection: [
      { name: "container", label: "Bucket name", placeholder: "acme-documents", required: true },
      { name: "projectId", label: "Project ID", placeholder: "acme-platform", required: true },
      PREFIX_FIELD,
      TTL_FIELD,
    ],
    credentials: [
      {
        name: "credentialsJsonRef",
        label: "Service account reference",
        placeholder: "ACME_GCP_CREDENTIALS",
        mono: true,
        hint: "Environment variable holding the service account JSON or its file path. Leave empty to use workload identity.",
      },
    ],
  },
  azure: {
    id: "azure",
    label: "Azure Blob Storage",
    summary: "Containers in an Azure storage account authenticated with an account key.",
    connection: [
      { name: "container", label: "Container name", placeholder: "documents", required: true },
      { name: "accountName", label: "Storage account", placeholder: "acmestorage", required: true },
      {
        name: "endpoint",
        label: "Blob service endpoint",
        placeholder: "https://acmestorage.blob.core.windows.net",
        hint: "Optional. Defaults to the public Azure endpoint for the account.",
      },
      PREFIX_FIELD,
      TTL_FIELD,
    ],
    credentials: [
      {
        name: "secretKeyRef",
        label: "Account key reference",
        placeholder: "ACME_AZURE_ACCOUNT_KEY",
        required: true,
        mono: true,
      },
    ],
  },
};

export const PROVIDER_LIST = Object.values(PROVIDER_SPECS);

export function providerLabel(provider: string | null | undefined): string {
  if (!provider) return "Not configured";
  return PROVIDER_SPECS[provider as ProviderType]?.label || provider;
}

export function providerFields(provider: ProviderType): ProviderFieldSpec[] {
  const spec = PROVIDER_SPECS[provider];
  return [...spec.connection, ...spec.credentials];
}

/** Builds the request payload with only the fields the provider actually uses. */
export function buildStoragePayload(
  provider: ProviderType,
  values: StorageFormValues
): StorageConfigPayload {
  const payload: Record<string, unknown> = { provider, container: values.container.trim() };
  for (const field of providerFields(provider)) {
    const value = values[field.name];
    if (field.type === "toggle") {
      payload[field.name] = Boolean(value);
    } else if (field.type === "number") {
      payload[field.name] = Number(value) || 900;
    } else if (typeof value === "string" && value.trim()) {
      payload[field.name] = value.trim();
    }
  }
  return payload as unknown as StorageConfigPayload;
}

/** Client-side mirror of the API validation, so users get instant feedback. */
export function validateStorageForm(
  provider: ProviderType,
  values: StorageFormValues
): Partial<Record<keyof StorageFormValues, string>> {
  const errors: Partial<Record<keyof StorageFormValues, string>> = {};
  const fields = providerFields(provider);

  for (const field of fields) {
    const raw = values[field.name];
    const value = typeof raw === "string" ? raw.trim() : raw;
    if (field.required && (value === "" || value === undefined)) {
      errors[field.name] = `${field.label} is required`;
    }
  }

  const container = values.container.trim();
  if (container) {
    const pattern =
      provider === "azure" ? /^[a-z0-9](?!.*--)[a-z0-9-]{1,61}[a-z0-9]$/ : /^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/;
    if (!pattern.test(container)) {
      errors.container =
        provider === "azure"
          ? "3–63 characters: lowercase letters, digits, single hyphens"
          : "3–63 characters: lowercase letters, digits, '.', '_' or '-'";
    }
  }

  if (values.region.trim() && !/^[a-z0-9][a-z0-9-]{1,31}$/.test(values.region.trim())) {
    errors.region = "Use a region code such as us-east-1";
  }

  if (values.endpoint.trim() && fields.some((field) => field.name === "endpoint")) {
    try {
      const url = new URL(values.endpoint.trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        errors.endpoint = "Endpoint must start with http:// or https://";
      }
    } catch {
      errors.endpoint = "Enter a full URL, for example https://minio.internal:9000";
    }
  }

  if (provider === "s3") {
    const hasAccess = Boolean(values.accessKeyRef.trim());
    const hasSecret = Boolean(values.secretKeyRef.trim());
    if (hasAccess !== hasSecret) {
      errors.secretKeyRef = "Provide both key references, or neither to use the IAM role";
    }
  }

  if (provider === "gcp" && values.projectId.trim() && !/^[a-z][a-z0-9-]{4,29}$/.test(values.projectId.trim())) {
    errors.projectId = "6–30 characters: lowercase letters, digits and hyphens";
  }

  if (provider === "azure" && values.accountName.trim() && !/^[a-z0-9]{3,24}$/.test(values.accountName.trim())) {
    errors.accountName = "3–24 lowercase letters or digits";
  }

  for (const field of fields) {
    if (!field.mono) continue;
    const value = String(values[field.name] || "").trim();
    if (value && !/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(value)) {
      errors[field.name] = "Use an environment variable name, not the secret itself";
    }
  }

  const ttl = Number(values.signedUrlTtlSeconds);
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 86400) {
    errors.signedUrlTtlSeconds = "Between 60 and 86400 seconds";
  }

  if (values.basePrefix.trim() && !/^[A-Za-z0-9._\-/]+$/.test(values.basePrefix.trim())) {
    errors.basePrefix = "Letters, digits, '.', '_', '-' and '/' only";
  }

  return errors;
}

/* ── Permission levels ────────────────────────────────────────────── */

export const PERMISSION_LEVELS: Array<{
  level: PermissionLevel;
  label: string;
  description: string;
  abilities: string[];
}> = [
  {
    level: "viewer",
    label: "Viewer",
    description: "Read only",
    abilities: ["View details", "Download versions"],
  },
  {
    level: "contributor",
    label: "Contributor",
    description: "Read and update",
    abilities: ["Everything a viewer can do", "Rename", "Upload new versions"],
  },
  {
    level: "manager",
    label: "Manager",
    description: "Update and remove",
    abilities: ["Everything a contributor can do", "Move to trash"],
  },
  {
    level: "owner",
    label: "Owner",
    description: "Full control",
    abilities: ["Everything a manager can do", "Grant and revoke access"],
  },
];

export function levelLabel(level: PermissionLevel): string {
  return PERMISSION_LEVELS.find((entry) => entry.level === level)?.label || level;
}

export function accessSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    platform_admin: "Platform administrator",
    tenant_admin: "Tenant administrator",
    creator: "Document owner",
    user_grant: "Granted to you",
    role_grant: "Granted to your role",
    none: "No access",
  };
  return labels[source] || source;
}

export function auditActionLabel(action: string): string {
  const labels: Record<string, string> = {
    "document.upload_session": "Upload started",
    "document.complete_upload": "Upload completed",
    "document.download_session": "Download link issued",
    "document.soft_delete": "Moved to trash",
    "document.restore": "Restored from trash",
    "document.permanent_delete": "Deleted permanently",
  };
  return labels[action] || action.replace(/[._]/g, " ");
}
