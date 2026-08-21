export type ProviderType = "s3" | "minio" | "gcp" | "azure";

export type DocumentStatus = "pending_upload" | "active" | "soft_deleted" | "failed";

export type TenantStatus = "active" | "suspended";

export type PermissionLevel = "viewer" | "contributor" | "manager" | "owner";

export type PrincipalType = "user" | "role";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  role?: string;
  ownerName: string | null;
  ownerEmail: string | null;
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

export interface StorageConfigPayload {
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

export interface FolderSummary {
  folder: Folder;
  /** Sub-folders below the folder itself. */
  folders: number;
  documents: number;
  bytes: number;
}

export interface FolderDeletion {
  folder: Folder;
  deleted: { folders: number; documents: number; bytes: number };
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

export interface DocumentAccess {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canAdmin: boolean;
  level: PermissionLevel;
  source: "platform_admin" | "tenant_admin" | "creator" | "user_grant" | "role_grant" | "none";
}

export interface DocumentPermission {
  id: string;
  tenantId: string;
  documentId: string;
  principalType: PrincipalType;
  principalId: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canAdmin: boolean;
  level: PermissionLevel;
  isDocumentCreator: boolean;
  createdBy: string;
  createdAt: string;
}

export interface TenantUser {
  userId: string;
  email?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  isOwner: boolean;
  documents: number;
  activeDocuments: number;
  trashedDocuments: number;
  bytes: number;
  versions: number;
  sharedWithThem: number;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
}

export interface TenantAnalytics {
  tenantId: string;
  generatedAt: string;
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
  folders: { total: number };
  versions: { total: number };
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
    createdAt: string;
  }>;
}

export type SessionScope = "platform" | "tenant";

export interface Session {
  scope: SessionScope;
  /** Empty for platform administrators until they open a tenant. */
  tenantId: string;
  tenantName?: string;
  tenantSlug?: string;
  userId: string;
  userName: string;
  roles: string[];
  /** Keycloak access token. The browser never stores the client secret. */
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  refreshExpiresAt?: number;
  /** Kept for the Keycloak end-session hint when the provider returns one. */
  idToken?: string;
  signedInAt: string;
}

export interface AuthTenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  role: string;
}

export interface AuthLoginResponse {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  expiresIn?: number;
  refreshExpiresIn?: number;
  user: {
    userId: string;
    email: string;
    displayName: string;
    username?: string;
    firstName?: string;
    lastName?: string;
  };
  role: string;
  roles?: string[];
  tenants: AuthTenant[];
}

export interface AuthRefreshResponse {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  expiresIn?: number;
  refreshExpiresIn?: number;
}


export interface HealthResponse {
  status: string;
  database: string;
  providers: string[];
}

export type MetricsSnapshot = Record<string, unknown>;

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
  signedUrl?: SignedUrl | null;
  previewable?: boolean;
  disposition?: "attachment" | "inline";
  url?: string;
}

export type PreviewSessionResult = DownloadSessionResult;

export interface ApiErrorBody {
  status?: string;
  code?: string;
  message?: string;
  error?: string;
  requestId?: string;
}
