import { ProviderType } from "./models";
import { ValidationError } from "../utils/errors";

/**
 * Single source of truth for what each storage provider needs.
 *
 * The API, the validator and the UI all derive their behaviour from this list, so a
 * tenant can never be saved with fields that belong to a different provider.
 * Credentials are stored as *references* (environment variable names), never as secrets.
 */
export type StorageFieldName =
  | "container"
  | "region"
  | "endpoint"
  | "accessKeyRef"
  | "secretKeyRef"
  | "sessionTokenRef"
  | "projectId"
  | "accountName"
  | "credentialsJsonRef"
  | "basePrefix"
  | "useSsl"
  | "signedUrlTtlSeconds";

export interface StorageFieldSpec {
  name: StorageFieldName;
  required: boolean;
  secretRef?: boolean;
}

export interface ProviderSpec {
  provider: ProviderType;
  label: string;
  fields: StorageFieldSpec[];
}

const COMMON_FIELDS: StorageFieldSpec[] = [
  { name: "basePrefix", required: false },
  { name: "signedUrlTtlSeconds", required: false },
];

export const PROVIDER_SPECS: Record<ProviderType, ProviderSpec> = {
  s3: {
    provider: "s3",
    label: "Amazon S3",
    fields: [
      { name: "container", required: true },
      { name: "region", required: true },
      { name: "endpoint", required: false },
      { name: "accessKeyRef", required: false, secretRef: true },
      { name: "secretKeyRef", required: false, secretRef: true },
      { name: "sessionTokenRef", required: false, secretRef: true },
      ...COMMON_FIELDS,
    ],
  },
  minio: {
    provider: "minio",
    label: "MinIO",
    fields: [
      { name: "container", required: true },
      { name: "endpoint", required: true },
      { name: "accessKeyRef", required: true, secretRef: true },
      { name: "secretKeyRef", required: true, secretRef: true },
      { name: "region", required: false },
      { name: "useSsl", required: false },
      ...COMMON_FIELDS,
    ],
  },
  gcp: {
    provider: "gcp",
    label: "Google Cloud Storage",
    fields: [
      { name: "container", required: true },
      { name: "projectId", required: true },
      { name: "credentialsJsonRef", required: false, secretRef: true },
      ...COMMON_FIELDS,
    ],
  },
  azure: {
    provider: "azure",
    label: "Azure Blob Storage",
    fields: [
      { name: "container", required: true },
      { name: "accountName", required: true },
      { name: "secretKeyRef", required: true, secretRef: true },
      { name: "endpoint", required: false },
      ...COMMON_FIELDS,
    ],
  },
};

export const PROVIDERS = Object.keys(PROVIDER_SPECS) as ProviderType[];

export function isProviderType(value: unknown): value is ProviderType {
  return typeof value === "string" && (PROVIDERS as string[]).includes(value);
}

export function fieldsFor(provider: ProviderType): StorageFieldName[] {
  return PROVIDER_SPECS[provider].fields.map((field) => field.name);
}

export interface StorageConfigInput {
  provider: ProviderType;
  container: string;
  region?: string;
  endpoint?: string;
  accessKeyRef?: string;
  secretKeyRef?: string;
  sessionTokenRef?: string;
  projectId?: string;
  accountName?: string;
  credentialsJsonRef?: string;
  basePrefix?: string;
  useSsl?: boolean;
  signedUrlTtlSeconds?: number;
}

const BUCKET_PATTERN = /^[a-z0-9][a-z0-9.\-_]{1,61}[a-z0-9]$/;
const AZURE_CONTAINER_PATTERN = /^[a-z0-9](?!.*--)[a-z0-9-]{1,61}[a-z0-9]$/;
const SECRET_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;
const ACCOUNT_NAME_PATTERN = /^[a-z0-9]{3,24}$/;
const REGION_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function requireField(value: string | undefined, message: string): string {
  if (!value) throw new ValidationError(message);
  return value;
}

function assertSecretRef(value: string | undefined, label: string): void {
  if (value && !SECRET_REF_PATTERN.test(value)) {
    throw new ValidationError(
      `${label} must be the name of an environment variable (letters, digits, "_", "-", ".", ":").`
    );
  }
}

function assertEndpoint(value: string, label = "Endpoint"): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ValidationError(`${label} must be a full URL, for example https://storage.example.com`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ValidationError(`${label} must use http or https`);
  }
}

/**
 * Validates the payload against the selected provider and strips every field that
 * does not belong to it, so no stale MinIO endpoint survives a switch to S3.
 */
export function normalizeStorageConfig(input: StorageConfigInput): StorageConfigInput {
  if (!isProviderType(input.provider)) {
    throw new ValidationError(`Unsupported storage provider. Use one of: ${PROVIDERS.join(", ")}`);
  }

  const provider = input.provider;
  const container = requireField(
    text(input.container),
    provider === "azure" ? "Container name is required" : "Bucket name is required"
  );

  if (provider === "azure") {
    if (!AZURE_CONTAINER_PATTERN.test(container)) {
      throw new ValidationError(
        "Container name must be 3-63 characters, lowercase letters, digits or single hyphens"
      );
    }
  } else if (!BUCKET_PATTERN.test(container)) {
    throw new ValidationError(
      "Bucket name must be 3-63 characters and may contain lowercase letters, digits, dots, hyphens and underscores"
    );
  }

  const basePrefix = text(input.basePrefix)?.replace(/^\/+|\/+$/g, "");
  if (basePrefix && !/^[A-Za-z0-9._\-/]+$/.test(basePrefix)) {
    throw new ValidationError("Object prefix may only contain letters, digits, '.', '_', '-' and '/'");
  }

  const ttl = input.signedUrlTtlSeconds ?? 900;
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 86400) {
    throw new ValidationError("Signed URL lifetime must be between 60 and 86400 seconds");
  }

  const normalized: StorageConfigInput = {
    provider,
    container,
    basePrefix,
    signedUrlTtlSeconds: ttl,
    useSsl: true,
  };

  const region = text(input.region);
  if (region && !REGION_PATTERN.test(region)) {
    throw new ValidationError("Region must look like us-east-1");
  }

  const endpoint = text(input.endpoint);
  const accessKeyRef = text(input.accessKeyRef);
  const secretKeyRef = text(input.secretKeyRef);
  const sessionTokenRef = text(input.sessionTokenRef);
  const projectId = text(input.projectId);
  const accountName = text(input.accountName);
  const credentialsJsonRef = text(input.credentialsJsonRef);

  assertSecretRef(accessKeyRef, "Access key reference");
  assertSecretRef(secretKeyRef, provider === "azure" ? "Account key reference" : "Secret key reference");
  assertSecretRef(sessionTokenRef, "Session token reference");
  assertSecretRef(credentialsJsonRef, "Service account credentials reference");

  switch (provider) {
    case "s3": {
      normalized.region = requireField(region, "AWS region is required, for example us-east-1");
      if (endpoint) {
        assertEndpoint(endpoint, "Custom endpoint");
        normalized.endpoint = endpoint;
      }
      if ((accessKeyRef && !secretKeyRef) || (!accessKeyRef && secretKeyRef)) {
        throw new ValidationError(
          "Provide both the access key and secret key references, or neither to use the instance IAM role"
        );
      }
      normalized.accessKeyRef = accessKeyRef;
      normalized.secretKeyRef = secretKeyRef;
      normalized.sessionTokenRef = sessionTokenRef;
      break;
    }
    case "minio": {
      const value = requireField(endpoint, "MinIO endpoint URL is required");
      assertEndpoint(value, "MinIO endpoint");
      normalized.endpoint = value;
      normalized.useSsl = input.useSsl ?? value.startsWith("https://");
      normalized.accessKeyRef = requireField(accessKeyRef, "Access key reference is required");
      normalized.secretKeyRef = requireField(secretKeyRef, "Secret key reference is required");
      normalized.region = region;
      break;
    }
    case "gcp": {
      normalized.projectId = requireField(projectId, "Google Cloud project ID is required");
      if (!/^[a-z][a-z0-9-]{4,29}$/.test(normalized.projectId)) {
        throw new ValidationError(
          "Google Cloud project ID must be 6-30 characters: lowercase letters, digits and hyphens"
        );
      }
      normalized.credentialsJsonRef = credentialsJsonRef;
      break;
    }
    case "azure": {
      normalized.accountName = requireField(accountName, "Storage account name is required");
      if (!ACCOUNT_NAME_PATTERN.test(normalized.accountName)) {
        throw new ValidationError("Storage account name must be 3-24 lowercase letters or digits");
      }
      normalized.secretKeyRef = requireField(secretKeyRef, "Account key reference is required");
      if (endpoint) {
        assertEndpoint(endpoint, "Blob service endpoint");
        normalized.endpoint = endpoint;
      }
      break;
    }
  }

  return normalized;
}
