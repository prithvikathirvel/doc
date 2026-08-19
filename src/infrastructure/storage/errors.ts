import {
  StorageConfigurationError,
  StorageDeleteError,
  StorageDownloadError,
  StorageError,
  StorageNotFoundError,
  StoragePermissionError,
  StorageTimeoutError,
  StorageUploadError,
} from "../../domain/exceptions";

const NOT_FOUND = [
  "NoSuchKey",
  "NotFound",
  "NoSuchBucket",
  "NotFoundError",
  "BlobNotFound",
  "ContainerNotFound",
  "404",
];

const PERMISSION = [
  "AccessDenied",
  "InvalidAccessKeyId",
  "SignatureDoesNotMatch",
  "Forbidden",
  "AuthorizationFailure",
  "403",
];

const TIMEOUT = ["TimeoutError", "RequestTimeout", "ETIMEDOUT", "ESOCKETTIMEDOUT", "Timeout"];

function collectCodes(err: unknown): string[] {
  const anyErr = err as { name?: string; code?: string; statusCode?: number; status?: number; message?: string };
  return [
    anyErr?.name,
    anyErr?.code,
    anyErr?.statusCode !== undefined ? String(anyErr.statusCode) : undefined,
    anyErr?.status !== undefined ? String(anyErr.status) : undefined,
    anyErr?.message,
  ].filter((v): v is string => Boolean(v));
}

export function translateStorageError(err: unknown, operation: "upload" | "download" | "delete" | "generic"): StorageError {
  if (err instanceof StorageError) {
    return err;
  }
  const codes = collectCodes(err);
  const message = (err as Error)?.message || "Storage operation failed";

  if (codes.some((c) => NOT_FOUND.some((n) => c.includes(n)))) {
    return new StorageNotFoundError(message);
  }
  if (codes.some((c) => PERMISSION.some((n) => c.includes(n)))) {
    return new StoragePermissionError(message);
  }
  if (codes.some((c) => TIMEOUT.some((n) => c.includes(n)))) {
    return new StorageTimeoutError(message);
  }

  if (operation === "upload") return new StorageUploadError(message);
  if (operation === "download") return new StorageDownloadError(message);
  if (operation === "delete") return new StorageDeleteError(message);
  return new StorageError(message);
}

export function requireConfig(value: string | undefined, field: string): string {
  if (!value) {
    throw new StorageConfigurationError(`Missing storage configuration: ${field}`);
  }
  return value;
}
