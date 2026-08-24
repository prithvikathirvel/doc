"use client";

import { BASE_PATH } from "./basePath";
import type {
  ApiErrorBody,
  AuthSession,
  ApiKeyRecord,
  ClaimResult,
  CreatedApiKey,
  DirectoryMember,
  Document,
  DocumentAccess,
  DocumentPermission,
  DocumentVersion,
  DownloadSessionResult,
  Folder,
  FolderDeletion,
  FolderSummary,
  HealthResponse,
  MemberRole,
  MetricsSnapshot,
  PermissionLevel,
  PrincipalType,
  PreviewSessionResult,
  Session,
  StorageConfigPayload,
  Tenant,
  TenantAnalytics,
  TenantDocConfig,
  TenantDocConfigResult,
  TenantDocPage,
  TenantUser,
  TenantStatus,
  TenantStorageConfig,
  UploadSessionResult,
} from "./types";

export class ApiError extends Error {
  status: number;
  code?: string;
  /** Correlation id returned by the API; quoted in support requests and found in the logs. */
  requestId?: string;

  constructor(message: string, status: number, body?: ApiErrorBody) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.code;
    this.requestId = body?.requestId;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  formData?: FormData;
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Overrides the workspace the request runs against (platform admins browsing a tenant). */
  tenantId?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  anonymous?: boolean;
};

function buildQuery(query?: RequestOptions["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

/**
 * Headers attached to API calls. Authentication itself travels in the
 * httpOnly session cookie (attached automatically); x-tenant-id selects the
 * workspace for tenant-scoped calls, and x-dms-client satisfies the API's
 * CSRF check on cookie-authenticated mutations.
 */
export function sessionHeaders(tenantId?: string): Record<string, string> {
  const headers: Record<string, string> = { "x-dms-client": "web" };
  const active = typeof window !== "undefined" ? window.localStorage.getItem("dms.activeTenant") : null;
  const scopedTenant = tenantId ?? (active || undefined);
  if (scopedTenant) headers["x-tenant-id"] = scopedTenant;
  return headers;
}

/** Fired when the cookie session is gone and the user must sign in again. */
export const SESSION_EXPIRED_EVENT = "dms:session-expired";

async function rawFetch<T>(path: string, options: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.anonymous ? {} : sessionHeaders(options.tenantId)),
    ...(options.headers || {}),
  };

  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const url = `${BASE_PATH}/api${path.startsWith("/") ? path : `/${path}`}${buildQuery(options.query)}`;
  const response = await fetch(url, {
    method: options.method || (body ? "POST" : "GET"),
    headers,
    body,
    signal: options.signal,
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let data: unknown;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const errorBody = (typeof data === "object" && data ? data : {}) as ApiErrorBody;
    throw new ApiError(
      errorBody.message || errorBody.error || `The request failed (${response.status})`,
      response.status,
      errorBody
    );
  }

  return data as T;
}

let refreshing: Promise<boolean> | null = null;

/** One shared refresh attempt: many parallel 401s trigger a single /auth/refresh. */
async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = rawFetch<{ session: AuthSession }>("/auth/refresh", { method: "POST", body: {}, anonymous: true })
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        setTimeout(() => {
          refreshing = null;
        }, 50);
      });
  }
  return refreshing;
}

async function apiFetch<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await rawFetch<T>(path, options);
  } catch (error) {
    const retriable =
      error instanceof ApiError &&
      error.status === 401 &&
      !options.anonymous &&
      (error.code === "TOKEN_EXPIRED" || error.code === "AUTH_REQUIRED");
    if (!retriable) throw error;

    // The access token expired mid-session: refresh once and retry.
    if (await tryRefresh()) {
      return rawFetch<T>(path, options);
    }
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("dms.activeTenant");
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    throw error;
  }
}

export function pickSignedUrl(
  payload: unknown
): { url: string; method?: string; headers?: Record<string, string> } | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.url === "string") {
    return {
      url: record.url,
      method: typeof record.method === "string" ? record.method : undefined,
      headers: (record.headers as Record<string, string> | undefined) || undefined,
    };
  }
  for (const key of ["download", "upload"]) {
    const nested = record[key];
    if (nested && typeof nested === "object" && typeof (nested as { url?: string }).url === "string") {
      const value = nested as { url: string; method?: string; headers?: Record<string, string> };
      return { url: value.url, method: value.method, headers: value.headers };
    }
  }
  return null;
}

/* ── Authentication ──────────────────────────────────────────────── */

export const authApi = {
  login: (email: string, password: string) =>
    apiFetch<{ session: AuthSession }>("/auth/login", {
      method: "POST",
      body: { email, password },
      anonymous: true,
    }),
  signup: (body: {
    email: string;
    password: string;
    username?: string;
    firstName?: string;
    lastName?: string;
  }) => apiFetch<{ message: string }>("/auth/signup", { method: "POST", body, anonymous: true }),
  session: () => apiFetch<{ session: AuthSession }>("/auth/session", { anonymous: true }),
  logout: () => apiFetch<{ message: string }>("/auth/logout", { method: "POST", body: {}, anonymous: true }),
};

/* ── Directory: members and API keys ─────────────────────────────── */

export const directoryApi = {
  listMembers: (tenantId: string) =>
    apiFetch<{ members: DirectoryMember[] }>(`/tenants/${tenantId}/members`, { tenantId }),
  addMember: (
    tenantId: string,
    body: { email?: string; userId?: string; role?: MemberRole; claimAliases?: string[] }
  ) =>
    apiFetch<{ member: DirectoryMember; claimed: ClaimResult }>(`/tenants/${tenantId}/members`, {
      method: "POST",
      body,
      tenantId,
    }),
  updateMember: (tenantId: string, userId: string, body: { role?: MemberRole; status?: "active" | "disabled" }) =>
    apiFetch<{ membership: DirectoryMember["membership"] }>(`/tenants/${tenantId}/members/${userId}`, {
      method: "PATCH",
      body,
      tenantId,
    }),
  removeMember: (tenantId: string, userId: string) =>
    apiFetch<void>(`/tenants/${tenantId}/members/${userId}`, { method: "DELETE", tenantId }),
  createUser: (
    body: {
      email: string;
      password: string;
      username?: string;
      firstName?: string;
      lastName?: string;
      tenantId?: string;
      role?: MemberRole;
      claimAliases?: string[];
    },
    tenantId?: string
  ) =>
    apiFetch<{ member: DirectoryMember | null; claimed: ClaimResult | null; email: string }>("/users", {
      method: "POST",
      body,
      tenantId,
    }),
  listApiKeys: () => apiFetch<{ apiKeys: ApiKeyRecord[] }>("/api-keys"),
  createApiKey: (body: { displayName: string; tenantId?: string | null; roles?: string[]; expiresAt?: string | null }) =>
    apiFetch<CreatedApiKey>("/api-keys", { method: "POST", body }),
  updateApiKey: (id: string, status: "active" | "disabled") =>
    apiFetch<{ message: string }>(`/api-keys/${id}`, { method: "PATCH", body: { status } }),
  deleteApiKey: (id: string) => apiFetch<void>(`/api-keys/${id}`, { method: "DELETE" }),
};

/* ── Platform ─────────────────────────────────────────────────────── */

export const platformApi = {
  health: () => apiFetch<HealthResponse>("/health", { anonymous: true }),
  metrics: () => apiFetch<MetricsSnapshot>("/metrics", { anonymous: true }),
  resolveWorkspace: (workspace: string) =>
    apiFetch<{
      workspace: { id: string; name: string; slug: string; status: TenantStatus };
    }>("/workspaces/resolve", { method: "POST", body: { workspace }, anonymous: true }),
};

/* ── Tenants ──────────────────────────────────────────────────────── */

export const tenantsApi = {
  list: () => apiFetch<{ tenants: Tenant[] }>("/tenants"),
  me: (tenantId?: string) =>
    apiFetch<{ tenant: Tenant; storage?: TenantStorageConfig | null }>("/tenants/me", { tenantId }),
  get: (id: string) =>
    apiFetch<{ tenant: Tenant; storage?: TenantStorageConfig | null }>(`/tenants/${id}`, {
      tenantId: id,
    }),
  analytics: (id: string) =>
    apiFetch<{ analytics: TenantAnalytics }>(`/tenants/${id}/analytics`, { tenantId: id }),
  users: (id: string) => apiFetch<{ users: TenantUser[] }>(`/tenants/${id}/users`, { tenantId: id }),
  create: (body: {
    name: string;
    slug?: string;
    ownerName?: string | null;
    ownerEmail?: string | null;
    maxFileSizeBytes?: number;
    allowedMimeTypes?: string[] | null;
    storage?: StorageConfigPayload;
  }) =>
    apiFetch<{ tenant: Tenant; storage: TenantStorageConfig | null }>("/tenants", {
      method: "POST",
      body,
    }),
  update: (
    id: string,
    body: {
      name?: string;
      status?: TenantStatus;
      ownerName?: string | null;
      ownerEmail?: string | null;
      maxFileSizeBytes?: number;
      allowedMimeTypes?: string[] | null;
    }
  ) => apiFetch<{ tenant: Tenant }>(`/tenants/${id}`, { method: "PATCH", body, tenantId: id }),
  saveStorage: (id: string, body: StorageConfigPayload) =>
    apiFetch<{ storage: TenantStorageConfig }>(`/tenants/${id}/storage`, {
      method: "PUT",
      body,
      tenantId: id,
    }),
};

/* ── Folders ──────────────────────────────────────────────────────── */

export const foldersApi = {
  list: (tenantId: string, parentId?: string | null) =>
    apiFetch<{ folders: Folder[] }>("/folders", {
      tenantId,
      query:
        parentId === undefined ? undefined : { parentId: parentId === null ? "null" : parentId },
    }),
  create: (tenantId: string, body: { name: string; parentId?: string | null }) =>
    apiFetch<{ folder: Folder }>("/folders", { method: "POST", body, tenantId }),
  rename: (tenantId: string, id: string, name: string) =>
    apiFetch<{ folder: Folder }>(`/folders/${id}`, { method: "PATCH", body: { name }, tenantId }),
  /** What a recursive delete would affect, used by the confirmation dialog. */
  summary: (tenantId: string, id: string) =>
    apiFetch<FolderSummary>(`/folders/${id}/summary`, { tenantId }),
  /** Deletes the folder, its sub-folders and their documents. */
  remove: (tenantId: string, id: string) =>
    apiFetch<FolderDeletion>(`/folders/${id}`, { method: "DELETE", tenantId }),
};

/* ── Documents ────────────────────────────────────────────────────── */

function normalizeList(raw: unknown): { documents: Document[]; total: number } {
  if (Array.isArray(raw)) return { documents: raw as Document[], total: raw.length };
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const documents =
      (record.documents as Document[] | undefined) || (record.items as Document[] | undefined) || [];
    const total = typeof record.total === "number" ? record.total : documents.length;
    return { documents, total };
  }
  return { documents: [], total: 0 };
}

export const documentsApi = {
  list: async (
    tenantId: string,
    params?: {
      folderId?: string | null;
      q?: string;
      createdBy?: string;
      includeDeleted?: boolean;
      limit?: number;
      offset?: number;
    }
  ) => {
    const raw = await apiFetch<unknown>("/documents", {
      tenantId,
      query: {
        folderId:
          params?.folderId === null
            ? "null"
            : params?.folderId === undefined
              ? undefined
              : params.folderId,
        q: params?.q,
        createdBy: params?.createdBy,
        includeDeleted: params?.includeDeleted ? true : undefined,
        limit: params?.limit,
        offset: params?.offset,
      },
    });
    return normalizeList(raw);
  },
  get: (tenantId: string, id: string, includeDeleted = false) =>
    apiFetch<{ document: Document; access: DocumentAccess }>(`/documents/${id}`, {
      tenantId,
      query: includeDeleted ? { includeDeleted: true } : undefined,
    }),
  uploadDirect: (tenantId: string, formData: FormData) =>
    apiFetch<{ document: Document }>("/documents", { method: "POST", formData, tenantId }),
  createSession: (
    tenantId: string,
    body: {
      filename: string;
      name?: string;
      mimeType?: string;
      size?: number;
      folderId?: string | null;
    }
  ) => apiFetch<UploadSessionResult>("/documents", { method: "POST", body, tenantId }),
  completeUpload: (tenantId: string, id: string, body?: { size?: number; checksum?: string }) =>
    apiFetch<{ document: Document }>(`/documents/${id}/upload`, {
      method: "POST",
      body: body || {},
      tenantId,
    }),
  download: (tenantId: string, id: string, versionNumber?: number) =>
    apiFetch<DownloadSessionResult>(`/documents/${id}/download`, {
      method: "POST",
      body: versionNumber ? { versionNumber } : {},
      tenantId,
    }),
  preview: (tenantId: string, id: string, versionNumber?: number) =>
    apiFetch<PreviewSessionResult>(`/documents/${id}/preview`, {
      method: "POST",
      body: versionNumber ? { versionNumber } : {},
      tenantId,
    }),
  contentUrl: (id: string, versionNumber?: number, disposition?: "inline" | "attachment") => {
    const params = new URLSearchParams();
    if (versionNumber) params.set("versionNumber", String(versionNumber));
    if (disposition) params.set("disposition", disposition);
    const query = params.toString();
    return `${BASE_PATH}/api/documents/${id}/content${query ? `?${query}` : ""}`;
  },
  rename: (tenantId: string, id: string, body: { name: string; folderId?: string | null }) =>
    apiFetch<{ document: Document }>(`/documents/${id}`, { method: "PATCH", body, tenantId }),
  moveToTrash: (tenantId: string, id: string) =>
    apiFetch<{ document: Document }>(`/documents/${id}`, { method: "DELETE", tenantId }),
  deleteForever: (tenantId: string, id: string) =>
    apiFetch<{ document?: Document }>(`/documents/${id}`, {
      method: "DELETE",
      query: { permanent: true },
      tenantId,
    }),
  restore: (tenantId: string, id: string) =>
    apiFetch<{ document: Document }>(`/documents/${id}/restore`, {
      method: "POST",
      body: {},
      tenantId,
    }),
  listVersions: (tenantId: string, id: string) =>
    apiFetch<{ versions: DocumentVersion[] }>(`/documents/${id}/versions`, { tenantId }),
  addVersion: (tenantId: string, id: string, formData: FormData) =>
    apiFetch<{ document: Document }>(`/documents/${id}/versions`, {
      method: "POST",
      formData,
      tenantId,
    }),
  listPermissions: (tenantId: string, id: string) =>
    apiFetch<{
      permissions: DocumentPermission[];
      access: DocumentAccess;
      levels: Array<{ level: PermissionLevel; description: string }>;
    }>(`/documents/${id}/permissions`, { tenantId }),
  grantAccess: (
    tenantId: string,
    id: string,
    body: { principalType: PrincipalType; principalId: string; level: PermissionLevel }
  ) =>
    apiFetch<{ permission: DocumentPermission }>(`/documents/${id}/permissions`, {
      method: "POST",
      body,
      tenantId,
    }),
  revokeAccess: (tenantId: string, id: string, permissionId: string) =>
    apiFetch<void>(`/documents/${id}/permissions/${permissionId}`, {
      method: "DELETE",
      tenantId,
    }),
};

/* ── Shareable developer documentation ──────────────────────────── */

export const docsApi = {
  /** Builder view: the saved configuration plus the pickable operation catalogue. */
  getConfig: (tenantId: string) =>
    apiFetch<TenantDocConfigResult>(`/tenants/${tenantId}/docs`, { tenantId }),
  /** Create or replace the documentation configuration (platform administrators). */
  saveConfig: (
    tenantId: string,
    body: {
      title?: string;
      intro?: string | null;
      apiBaseUrl?: string | null;
      selectedOperations?: string[];
      status?: "active" | "disabled";
    }
  ) =>
    apiFetch<{ config: TenantDocConfig }>(`/tenants/${tenantId}/docs`, {
      method: "PUT",
      body,
      tenantId,
    }),
  /** Partial update: toggle status, regenerate the share token, amend fields. */
  updateConfig: (
    tenantId: string,
    body: {
      title?: string;
      intro?: string | null;
      apiBaseUrl?: string | null;
      selectedOperations?: string[];
      status?: "active" | "disabled";
      regenerateToken?: boolean;
    }
  ) =>
    apiFetch<{ config: TenantDocConfig }>(`/tenants/${tenantId}/docs`, {
      method: "PATCH",
      body,
      tenantId,
    }),
  /** Public documentation page resolved by share token. No session required. */
  publicPage: (token: string) =>
    apiFetch<TenantDocPage>(`/docs/${encodeURIComponent(token)}`, { anonymous: true }),
};
