import path from "path";
import { ValidationError } from "../utils/errors";
import { Tenant } from "../service/models";

const DEFAULT_ALLOWED = [
  "application/pdf",
  "application/json",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

const EXT_MIME: Record<string, string> = {
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".zip": "application/zip",
};

export function inferMimeType(filename: string, provided?: string): string {
  if (provided && provided !== "application/octet-stream") {
    return provided;
  }
  return EXT_MIME[path.extname(filename).toLowerCase()] || provided || "application/octet-stream";
}

export function validateUpload(tenant: Tenant, input: { filename: string; mimeType: string; size: number }): void {
  if (!input.filename || input.filename.includes("..") || input.filename.includes("/") || input.filename.includes("\\")) {
    throw new ValidationError("Invalid filename");
  }
  if (input.size < 0) {
    throw new ValidationError("Invalid file size");
  }
  if (input.size > tenant.maxFileSizeBytes) {
    throw new ValidationError(`File exceeds tenant size limit of ${tenant.maxFileSizeBytes} bytes`);
  }
  const allowed = tenant.allowedMimeTypes && tenant.allowedMimeTypes.length > 0 ? tenant.allowedMimeTypes : DEFAULT_ALLOWED;
  if (allowed.length > 0 && !allowed.includes(input.mimeType) && input.mimeType !== "application/octet-stream") {
    throw new ValidationError(`MIME type ${input.mimeType} is not allowed for this tenant`);
  }
}
