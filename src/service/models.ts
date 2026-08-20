export type ProviderType = "s3" | "minio" | "gcp" | "azure";

export type DocumentStatus = "pending_upload" | "active" | "soft_deleted" | "failed";

export type PermissionAction = "read" | "write" | "delete" | "admin";

export type PermissionLevel = "viewer" | "contributor" | "manager" | "owner";

export interface AccessFlags {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canAdmin: boolean;
}

export type AccessSource =
  | "platform_admin"
  | "tenant_admin"
  | "creator"
  | "user_grant"
  | "role_grant"
  | "none";

export interface DocumentAccess extends AccessFlags {
  level: PermissionLevel;
  source: AccessSource;
}

export interface StorageLocation {
  provider: ProviderType | string;
  container: string;
  objectKey: string;
  versionId?: string;
}

export interface ObjectMetadata {
  location: StorageLocation;
  size: number;
  contentType?: string;
  etag?: string;
  checksum?: string;
  lastModified?: Date;
  custom?: Record<string, string>;
}

export interface StorageObjectSummary {
  objectKey: string;
  size?: number;
  lastModified?: Date;
  etag?: string;
}

export interface StorageCapabilities {
  signedUploadUrl: boolean;
  signedDownloadUrl: boolean;
  multipartUpload: boolean;
  streaming: boolean;
  copy: boolean;
  list: boolean;
}

export interface StorageProviderConfig {
  provider: ProviderType;
  container: string;
  region?: string;
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
  sessionToken?: string;
  projectId?: string;
  accountName?: string;
  accountKey?: string;
  credentialsJson?: string;
  basePrefix?: string;
  useSsl?: boolean;
  signedUrlTtlSeconds?: number;
}

export type TenantStatus = "active" | "suspended";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  ownerName: string | null;
  ownerEmail: string | null;
  maxFileSizeBytes: number;
  allowedMimeTypes: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantStorageConfig {
  id: string;
  tenantId: string;
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
  useSsl: boolean;
  signedUrlTtlSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Folder {
  id: string;
  tenantId: string;
  parentId: string | null;
  name: string;
  path: string;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface Document {
  id: string;
  tenantId: string;
  folderId: string | null;
  name: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  checksum: string | null;
  storageProvider: string;
  storageContainer: string;
  storageKey: string;
  currentVersion: number;
  status: DocumentStatus;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  idempotencyKey: string | null;
  metadata: Record<string, unknown>;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  tenantId: string;
  versionNumber: number;
  storageProvider: string;
  storageContainer: string;
  storageKey: string;
  checksum: string | null;
  size: number;
  mimeType: string;
  createdBy: string;
  createdAt: Date;
}

export type PrincipalType = "user" | "role";

export interface DocumentPermission extends AccessFlags {
  id: string;
  tenantId: string;
  documentId: string;
  principalType: PrincipalType;
  principalId: string;
  createdBy: string;
  createdAt: Date;
}

/** A grant enriched with its level, which is what clients read and write. */
export interface DocumentPermissionView extends DocumentPermission {
  level: PermissionLevel;
  isDocumentCreator: boolean;
}

export interface TenantUser {
  userId: string;
  /** How the principal is known to the tenant. */
  isOwner: boolean;
  documents: number;
  activeDocuments: number;
  trashedDocuments: number;
  bytes: number;
  versions: number;
  sharedWithThem: number;
  firstActivityAt: Date | null;
  lastActivityAt: Date | null;
}

export interface TenantAnalytics {
  tenantId: string;
  generatedAt: Date;
  documents: {
    total: number;
    active: number;
    pendingUpload: number;
    failed: number;
    inTrash: number;
    createdLast30Days: number;
  };
  storage: {
    activeBytes: number;
    trashBytes: number;
    versionBytes: number;
    averageDocumentBytes: number;
    largestDocumentBytes: number;
  };
  folders: {
    total: number;
  };
  versions: {
    total: number;
  };
  contributors: {
    total: number;
    top: Array<{ userId: string; documents: number; bytes: number }>;
  };
  fileTypes: Array<{ mimeType: string; documents: number; bytes: number }>;
  uploadTrend: Array<{ date: string; documents: number; bytes: number }>;
  recentActivity: Array<{
    action: string;
    actorId: string;
    resourceType: string;
    resourceId: string;
    success: boolean;
    createdAt: Date;
  }>;
}

export interface AuditEvent {
  tenantId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  provider?: string;
  success: boolean;
  errorCategory?: string;
  durationMs?: number;
  details?: Record<string, unknown>;
}

export interface AuthContext {
  userId: string;
  userName: string;
  tenantId: string;
  roles: string[];
}

export function storageLocationOf(document: Document, version?: DocumentVersion): StorageLocation {
  if (version) {
    return {
      provider: version.storageProvider,
      container: version.storageContainer,
      objectKey: version.storageKey,
    };
  }
  return {
    provider: document.storageProvider,
    container: document.storageContainer,
    objectKey: document.storageKey,
  };
}

/** Object keys never contain characters that need escaping in a storage URL. */
export function sanitizeKeySegment(value: string): string {
  const safe = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "");
  return safe || "unknown";
}

/**
 * Layout of every stored object:
 *
 *   <basePrefix>/<tenantId>/<userId>/<documentId>/v<version>/<filename>
 *
 * The owner segment keeps each user's documents in their own prefix, which makes
 * per-user listing, lifecycle rules and bucket-level policies straightforward.
 * All versions of a document stay under the owner that created it.
 */
export function buildObjectKey(params: {
  basePrefix?: string;
  tenantId: string;
  userId: string;
  documentId: string;
  version: number;
  filename: string;
}): string {
  const parts = [
    params.basePrefix?.replace(/^\/+|\/+$/g, ""),
    params.tenantId,
    sanitizeKeySegment(params.userId),
    params.documentId,
    `v${params.version}`,
    sanitizeKeySegment(params.filename),
  ].filter(Boolean);
  return parts.join("/");
}
