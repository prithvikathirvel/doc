export type ProviderType = "s3" | "minio" | "gcp" | "azure";

export type DocumentStatus = "pending_upload" | "active" | "soft_deleted" | "failed";

export type TenantStatus = "active" | "suspended";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  maxFileSizeBytes: number;
  allowedMimeTypes: string[] | null;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  id: string;
  tenantId: string;
  parentId: string | null;
  name: string;
  path: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
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
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
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
  createdAt: string;
}

export interface DocumentPermission {
  id: string;
  tenantId: string;
  documentId: string;
  principalType: "user" | "role";
  principalId: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canAdmin: boolean;
  createdBy: string;
  createdAt: string;
}

export interface SessionIdentity {
  tenantId: string;
  userId: string;
  userName: string;
  roles: string[];
}

export interface HealthResponse {
  status: string;
  database: string;
  providers: string[];
}

export interface MetricsSnapshot {
  [key: string]: unknown;
}

export interface SignedUrl {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  expiresAt?: string;
}

export interface UploadSessionResult {
  document: Document;
  upload?: SignedUrl | null;
  replayed?: boolean;
}

export interface DownloadSessionResult {
  document?: Document;
  version?: DocumentVersion | null;
  download?: SignedUrl | null;
  /** flattened convenience if API ever returns url at top level */
  url?: string;
}

export interface DocumentListResult {
  documents: Document[];
  items?: Document[];
  total?: number;
  limit?: number;
  offset?: number;
}

export interface ApiErrorBody {
  status?: string;
  code?: string;
  message?: string;
  error?: string;
}
