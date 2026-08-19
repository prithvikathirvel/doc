"use client";

import type { SessionIdentity, ApiErrorBody } from "./types";
import { loadSession } from "./session";

export function pickSignedUrl(payload: unknown): { url: string; method?: string; headers?: Record<string, string> } | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  if (typeof obj.url === "string") {
    return {
      url: obj.url,
      method: typeof obj.method === "string" ? obj.method : undefined,
      headers: (obj.headers as Record<string, string> | undefined) || undefined,
    };
  }
  for (const key of ["download", "upload"]) {
    const nested = obj[key];
    if (nested && typeof nested === "object" && typeof (nested as { url?: string }).url === "string") {
      const n = nested as { url: string; method?: string; headers?: Record<string, string> };
      return { url: n.url, method: n.method, headers: n.headers };
    }
  }
  return null;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  body?: ApiErrorBody;

  constructor(message: string, status: number, body?: ApiErrorBody) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.code;
    this.body = body;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  formData?: FormData;
  query?: Record<string, string | number | boolean | null | undefined>;
  session?: SessionIdentity;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  raw?: boolean;
};

function buildQuery(query?: RequestOptions["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });
  const s = params.toString();
  return s ? `?${s}` : "";
}

export async function apiFetch<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const session = options.session || loadSession();
  const headers: Record<string, string> = {
    "x-tenant-id": session.tenantId,
    "x-user-id": session.userId,
    "x-user-name": session.userName,
    "x-roles": session.roles.join(","),
    ...(options.headers || {}),
  };

  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const url = `/api${path.startsWith("/") ? path : `/${path}`}${buildQuery(options.query)}`;
  const res = await fetch(url, {
    method: options.method || (body ? "POST" : "GET"),
    headers,
    body,
    signal: options.signal,
  });

  if (options.raw) {
    if (!res.ok) {
      let errBody: ApiErrorBody | undefined;
      try {
        errBody = (await res.json()) as ApiErrorBody;
      } catch {
        /* ignore */
      }
      throw new ApiError(errBody?.message || errBody?.error || res.statusText || "Request failed", res.status, errBody);
    }
    return res as unknown as T;
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const errBody = (typeof data === "object" && data ? data : {}) as ApiErrorBody;
    throw new ApiError(
      errBody.message || errBody.error || `Request failed (${res.status})`,
      res.status,
      errBody
    );
  }

  return data as T;
}

// ─── Health / Metrics ───────────────────────────────────────────────

export const healthApi = {
  get: () => apiFetch<import("./types").HealthResponse>("/health"),
  metrics: () => apiFetch<import("./types").MetricsSnapshot>("/metrics"),
};

// ─── Tenants ────────────────────────────────────────────────────────

export const tenantsApi = {
  list: () => apiFetch<{ tenants: import("./types").Tenant[] }>("/tenants"),
  me: () =>
    apiFetch<{
      tenant: import("./types").Tenant;
      storage?: import("./types").TenantStorageConfig | null;
    }>("/tenants/me"),
  get: (id: string) =>
    apiFetch<{
      tenant: import("./types").Tenant;
      storage?: import("./types").TenantStorageConfig | null;
    }>(`/tenants/${id}`),
  create: (body: {
    name: string;
    slug?: string;
    maxFileSizeBytes?: number;
    allowedMimeTypes?: string[] | null;
  }) => apiFetch<{ tenant: import("./types").Tenant }>("/tenants", { method: "POST", body }),
  upsertStorage: (
    id: string,
    body: {
      provider: string;
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
  ) =>
    apiFetch<{ storage: import("./types").TenantStorageConfig }>(`/tenants/${id}/storage`, {
      method: "PUT",
      body,
    }),
};

// ─── Folders ────────────────────────────────────────────────────────

export const foldersApi = {
  list: (parentId?: string | null) =>
    apiFetch<{ folders: import("./types").Folder[] }>("/folders", {
      query: parentId === undefined ? undefined : { parentId: parentId === null ? "null" : parentId },
    }),
  get: (id: string) => apiFetch<{ folder: import("./types").Folder }>(`/folders/${id}`),
  create: (body: { name: string; parentId?: string | null }) =>
    apiFetch<{ folder: import("./types").Folder }>("/folders", { method: "POST", body }),
  rename: (id: string, name: string) =>
    apiFetch<{ folder: import("./types").Folder }>(`/folders/${id}`, {
      method: "PATCH",
      body: { name },
    }),
  remove: (id: string) => apiFetch<void>(`/folders/${id}`, { method: "DELETE" }),
};

// ─── Documents ──────────────────────────────────────────────────────

export async function normalizeDocumentList(raw: unknown): Promise<{
  documents: import("./types").Document[];
  total: number;
}> {
  if (Array.isArray(raw)) {
    return { documents: raw as import("./types").Document[], total: raw.length };
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const docs =
      (obj.documents as import("./types").Document[] | undefined) ||
      (obj.items as import("./types").Document[] | undefined) ||
      [];
    const total = typeof obj.total === "number" ? obj.total : docs.length;
    return { documents: docs, total };
  }
  return { documents: [], total: 0 };
}

export const documentsApi = {
  list: async (params?: {
    folderId?: string | null;
    q?: string;
    includeDeleted?: boolean;
    limit?: number;
    offset?: number;
  }) => {
    const raw = await apiFetch<unknown>("/documents", {
      query: {
        folderId:
          params?.folderId === null ? "null" : params?.folderId === undefined ? undefined : params.folderId,
        q: params?.q,
        includeDeleted: params?.includeDeleted ? true : undefined,
        limit: params?.limit,
        offset: params?.offset,
      },
    });
    return normalizeDocumentList(raw);
  },
  get: (id: string, includeDeleted = false) =>
    apiFetch<{ document: import("./types").Document }>(`/documents/${id}`, {
      query: includeDeleted ? { includeDeleted: true } : undefined,
    }),
  metadata: (id: string) => apiFetch<Record<string, unknown>>(`/documents/${id}/metadata`),
  createDirect: (formData: FormData) =>
    apiFetch<{ document: import("./types").Document }>("/documents", {
      method: "POST",
      formData,
    }),
  createSession: (
    body: {
      filename: string;
      name?: string;
      mimeType?: string;
      size?: number;
      folderId?: string | null;
      metadata?: Record<string, unknown>;
      idempotencyKey?: string;
    },
    headers?: Record<string, string>
  ) =>
    apiFetch<import("./types").UploadSessionResult>("/documents", {
      method: "POST",
      body,
      headers,
    }),
  completeUpload: (id: string, body?: { size?: number; checksum?: string }) =>
    apiFetch<{ document: import("./types").Document }>(`/documents/${id}/upload`, {
      method: "POST",
      body: body || {},
    }),
  download: (id: string, versionNumber?: number) =>
    apiFetch<import("./types").DownloadSessionResult>(`/documents/${id}/download`, {
      method: "POST",
      body: versionNumber ? { versionNumber } : {},
    }),
  contentUrl: (id: string, versionNumber?: number) => {
    const q = versionNumber ? `?versionNumber=${versionNumber}` : "";
    return `/api/documents/${id}/content${q}`;
  },
  rename: (id: string, body: { name: string; folderId?: string | null }) =>
    apiFetch<{ document: import("./types").Document }>(`/documents/${id}`, {
      method: "PATCH",
      body,
    }),
  softDelete: (id: string) =>
    apiFetch<{ document: import("./types").Document }>(`/documents/${id}`, { method: "DELETE" }),
  permanentDelete: (id: string) =>
    apiFetch<{ deleted?: boolean } | { document?: import("./types").Document }>(`/documents/${id}`, {
      method: "DELETE",
      query: { permanent: true },
    }),
  restore: (id: string) =>
    apiFetch<{ document: import("./types").Document }>(`/documents/${id}/restore`, {
      method: "POST",
      body: {},
    }),
  listVersions: (id: string) =>
    apiFetch<{ versions: import("./types").DocumentVersion[] }>(`/documents/${id}/versions`),
  createVersionDirect: (id: string, formData: FormData) =>
    apiFetch<{ document: import("./types").Document }>(`/documents/${id}/versions`, {
      method: "POST",
      formData,
    }),
  listPermissions: (id: string) =>
    apiFetch<{ permissions: import("./types").DocumentPermission[] }>(`/documents/${id}/permissions`),
  grantPermission: (
    id: string,
    body: {
      principalType: "user" | "role";
      principalId: string;
      canRead?: boolean;
      canWrite?: boolean;
      canDelete?: boolean;
      canAdmin?: boolean;
    }
  ) =>
    apiFetch<{ permission: import("./types").DocumentPermission }>(`/documents/${id}/permissions`, {
      method: "POST",
      body,
    }),
  revokePermission: (id: string, permissionId: string) =>
    apiFetch<void>(`/documents/${id}/permissions/${permissionId}`, { method: "DELETE" }),
};
