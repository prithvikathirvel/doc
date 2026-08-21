"use client";

import type {
  ApiErrorBody,
  AuthLoginResponse,
  AuthRefreshResponse,
  Document,
  DocumentAccess,
  DocumentPermission,
  DocumentVersion,
  DownloadSessionResult,
  PreviewSessionResult,
  Folder,
  FolderDeletion,
  FolderSummary,
  HealthResponse,
  MetricsSnapshot,
  PermissionLevel,
  PrincipalType,
  Session,
  StorageConfigPayload,
  Tenant,
  TenantAnalytics,
  TenantUser,
  TenantStatus,
  TenantStorageConfig,
  UploadSessionResult,
} from "./types";
import {
  clearSession,
  loadSession,
  loginPathFor,
  MEMBER_ROLE,
  PLATFORM_ADMIN_ROLE,
  saveSession,
  TENANT_ADMIN_ROLE,
} from "./session";

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
  /** Overrides the tenant the request runs against (platform admins browsing a tenant). */
  tenantId?: string;
  session?: Session | null;
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

const APP_ID = process.env.NEXT_PUBLIC_DMS_APP_ID || "DMS";
const AUTH_MODE = (process.env.NEXT_PUBLIC_AUTH_MODE || "keycloak").toLowerCase();
const USER_MGT_BASE_URL = (
  process.env.NEXT_PUBLIC_USER_MGT_BASE_URL || "https://apidev.sifymodernization.digital/user-mgt"
).replace(/\/+$/, "");
const DMS_API_BASE_URL = (process.env.NEXT_PUBLIC_DMS_API_BASE_URL || "").replace(/\/+$/, "");
const KEYCLOAK_BASE_URL = (process.env.NEXT_PUBLIC_KEYCLOAK_BASE_URL || "").replace(/\/+$/, "");
const KEYCLOAK_REALM = process.env.NEXT_PUBLIC_KEYCLOAK_REALM || "dms";
const KEYCLOAK_CLIENT_ID = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || "dms-web";
// Only an explicitly configured public token URL is used in the browser. The
// KEYCLOAK_BASE_URL from backend environments may be private/internal, so it
// must never be assumed to be browser-reachable.
const KEYCLOAK_TOKEN_URL = process.env.NEXT_PUBLIC_KEYCLOAK_TOKEN_URL || "";
const KEYCLOAK_LOGOUT_URL = KEYCLOAK_BASE_URL
  ? `${KEYCLOAK_BASE_URL}/realms/${encodeURIComponent(KEYCLOAK_REALM)}/protocol/openid-connect/logout`
  : "";
let refreshInFlight: Promise<Session> | null = null;

/** Headers shared by every authenticated browser request. */
export function sessionHeaders(tenantId?: string, session?: Session | null): Record<string, string> {
  const active = session ?? loadSession();
  const headers: Record<string, string> = { "x-app-id": APP_ID };
  if (!active) return headers;
  const scopedTenant = tenantId ?? active.tenantId;
  if (scopedTenant) headers["x-tenant-id"] = scopedTenant;

  const token = (active.accessToken || active.idToken || "").trim();
  if (token) headers["authorization"] = `Bearer ${token}`;

  // This branch is intentionally limited to the staged local/header mode. No
  // client-supplied identity headers are sent when JWKS authentication is live.
  if (AUTH_MODE === "headers") {
    headers["x-user-id"] = active.userId;
    headers["x-user-name"] = active.userName;
    headers["x-roles"] = active.roles.join(",");
  }
  return headers;
}

export async function apiFetch<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  let active = options.session ?? loadSession();
  if (!options.anonymous && active) {
    active = await refreshSessionIfNeeded(active);
  }

  const headers: Record<string, string> = {
    ...(options.anonymous ? {} : sessionHeaders(options.tenantId, active)),
    ...(options.headers || {}),
  };

  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const relativeUrl = `/api${path.startsWith("/") ? path : `/${path}`}${buildQuery(options.query)}`;
  const url = DMS_API_BASE_URL ? `${DMS_API_BASE_URL}${relativeUrl}` : relativeUrl;
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
    const detail = errorBody.message || errorBody.error || `The request failed (${response.status})`;
    const message =
      response.status >= 500 && errorBody.requestId
        ? `${detail} (reference ${errorBody.requestId})`
        : detail;
    throw new ApiError(message, response.status, errorBody);
  }

  return data as T;
}

async function refreshSessionIfNeeded(active: Session): Promise<Session> {
  if (!active.refreshToken || active.expiresAt === undefined) return active;
  const now = Math.floor(Date.now() / 1000);
  if (active.expiresAt - now > 60) return active;
  if (active.refreshExpiresAt !== undefined && active.refreshExpiresAt <= now) {
    expireBrowserSession(active);
    throw new ApiError("Your session has expired. Sign in again.", 401);
  }
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const response = KEYCLOAK_TOKEN_URL
        ? await fetch(KEYCLOAK_TOKEN_URL, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "refresh_token",
              client_id: KEYCLOAK_CLIENT_ID,
              refresh_token: active.refreshToken || "",
            }).toString(),
          })
        : await fetch(`${DMS_API_BASE_URL}/api/auth/refresh`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-app-id": APP_ID },
            body: JSON.stringify({ refreshToken: active.refreshToken }),
          });
      const text = await response.text();
      let body: unknown;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
      if (!response.ok) {
        const errorBody = (typeof body === "object" && body ? body : {}) as ApiErrorBody;
        throw new ApiError(errorBody.message || "Your session has expired. Sign in again.", response.status, errorBody);
      }
      const refreshed = normalizeRefreshResponse(body);
      const next: Session = {
        ...active,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken || active.refreshToken,
        idToken: refreshed.idToken || active.idToken,
        expiresAt: now + (refreshed.expiresIn || 300),
        refreshExpiresAt:
          refreshed.refreshExpiresIn !== undefined
            ? now + refreshed.refreshExpiresIn
            : active.refreshExpiresAt,
      };
      saveSession(next);
      return next;
    } catch (error) {
      expireBrowserSession(active);
      if (error instanceof ApiError) throw error;
      throw new ApiError("Your session has expired. Sign in again.", 401);
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

function expireBrowserSession(active: Session): void {
  clearSession();
  if (typeof window !== "undefined" && !window.location.pathname.endsWith("/login")) {
    window.location.replace(loginPathFor(active));
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

async function userManagementFetch<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const response = await fetch(`${USER_MGT_BASE_URL}${path}`, {
    method: options.method || (options.body === undefined ? "GET" : "POST"),
    headers: {
      accept: "application/json",
      "x-app-id": APP_ID,
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = await readResponseBody(response);
  if (!response.ok) throw apiErrorFromResponse(response.status, body, "User Management Service request failed");
  return body as T;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function apiErrorFromResponse(status: number, body: unknown, fallback: string): ApiError {
  const record = asRecord(body);
  return new ApiError(stringValue(record.message, record.error, record.detail) || fallback, status, {
    message: stringValue(record.message),
    error: stringValue(record.error),
    code: stringValue(record.code),
  });
}

function normalizeUserManagementLogin(raw: unknown): AuthLoginResponse {
  const source = asRecord(raw);
  const nestedData = asRecord(source.data);
  const data = Object.keys(nestedData).length ? nestedData : source;
  const tokens = asRecord(data.tokens || source.tokens);
  const accessToken = stringValue(
    data.accessToken,
    data.access_token,
    tokens.accessToken,
    tokens.access_token,
    source.accessToken,
    source.access_token
  );
  const refreshToken = stringValue(
    data.refreshToken,
    data.refresh_token,
    tokens.refreshToken,
    tokens.refresh_token,
    source.refreshToken,
    source.refresh_token
  );
  if (!accessToken || !refreshToken) {
    throw new ApiError("User Management Service returned no login tokens", 502);
  }

  const claims = decodeJwtPayload(accessToken);
  const userSource = asRecord(data.user || data.userDetails || data.profile || source.user || source.profile);
  const email = stringValue(userSource.email, data.email, source.email, claims.email) || "";
  const userId = stringValue(userSource.userId, userSource.user_id, userSource.id, claims.sub) || email;
  const username =
    stringValue(userSource.username, userSource.userName, userSource.preferred_username, claims.preferred_username, email) || userId;
  const firstName = stringValue(userSource.firstName, userSource.first_name, userSource.given_name, claims.given_name);
  const lastName = stringValue(userSource.lastName, userSource.last_name, userSource.family_name, claims.family_name);
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || username || email || userId;
  const roles = normalizeDmsRoles([
    ...roleValues(data.roles),
    ...roleValues(data.role),
    ...roleValues(source.roles),
    ...roleValues(source.role),
    ...roleValues(data.application),
    ...roleValues(data.applicationInformation),
    ...roleValues(data.applicationInfo),
    ...roleValues(source.application),
    ...roleValues(source.applicationInformation),
    ...roleValues(source.applicationInfo),
    ...roleValues(claims.roles),
    ...roleValues(claims.realm_access),
    ...roleValues(asRecord(claims.resource_access)[KEYCLOAK_CLIENT_ID]),
  ]);
  const role = roles.find((value) => value === PLATFORM_ADMIN_ROLE) || roles[0] || MEMBER_ROLE;
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = firstNumber(data.expiresIn, data.expires_in, tokens.expiresIn, tokens.expires_in, source.expiresIn, source.expires_in)
    || (typeof claims.exp === "number" ? Math.max(0, claims.exp - now) : 300);
  const refreshExpiresIn = firstNumber(
    data.refreshExpiresIn,
    data.refresh_expires_in,
    tokens.refreshExpiresIn,
    tokens.refresh_expires_in,
    source.refreshExpiresIn,
    source.refresh_expires_in
  );

  return {
    accessToken,
    refreshToken,
    idToken: stringValue(data.idToken, data.id_token, tokens.idToken, tokens.id_token, source.idToken, source.id_token),
    expiresIn,
    refreshExpiresIn,
    user: {
      userId,
      email,
      displayName,
      username,
      firstName,
      lastName,
    },
    role,
    roles,
    tenants: normalizeAuthTenants(
      data.tenants ||
        source.tenants ||
        data.application?.tenants ||
        data.applicationInformation?.tenants ||
        data.applicationInfo?.tenants
    ),
  };
}

function normalizeRefreshResponse(raw: unknown): AuthRefreshResponse {
  const source = asRecord(raw);
  const accessToken = stringValue(source.accessToken, source.access_token);
  const refreshToken = stringValue(source.refreshToken, source.refresh_token);
  if (!accessToken || !refreshToken) throw new ApiError("Token endpoint returned no refreshed tokens", 502);
  return {
    accessToken,
    refreshToken,
    idToken: stringValue(source.idToken, source.id_token),
    expiresIn: firstNumber(source.expiresIn, source.expires_in),
    refreshExpiresIn: firstNumber(source.refreshExpiresIn, source.refresh_expires_in),
  };
}

function normalizeAuthTenants(value: unknown): AuthLoginResponse["tenants"] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .map((item) => {
      const tenant = asRecord(item);
      return {
        id: stringValue(tenant.id, tenant.tenantId, tenant.tenant_id) || "",
        name: stringValue(tenant.name, tenant.tenantName) || "",
        slug: stringValue(tenant.slug) || stringValue(tenant.id, tenant.tenantId) || "",
        status: (tenant.status === "suspended" ? "suspended" : "active") as "active" | "suspended",
        role: normalizeDmsRole(stringValue(tenant.role, tenant.roleName) || "") || MEMBER_ROLE,
      };
    })
    .filter((tenant) => Boolean(tenant.id));
}

function normalizeDmsRoles(values: string[]): string[] {
  return [...new Set(values.map(normalizeDmsRole).filter(Boolean))];
}

function normalizeDmsRole(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/^dms[\\s_-]+/, "").replace(/^role[\\s_-]+/, "").replace(/[\\s-]+/g, "_");
  if (["platform_admin", "platformadmin"].includes(normalized)) return PLATFORM_ADMIN_ROLE;
  if (["tenant_admin", "tenantadmin", "admin"].includes(normalized)) return TENANT_ADMIN_ROLE;
  if (normalized === MEMBER_ROLE) return MEMBER_ROLE;
  return "";
}

function roleValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => roleValues(item));
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  const record = asRecord(value);
  if (!Object.keys(record).length) return [];
  return [record.roleName, record.name, record.role, ...(Array.isArray(record.roles) ? record.roles : [])].flatMap((item) =>
    roleValues(item)
  );
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const encoded = token.split(".")[1];
    if (!encoded) return {};
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function stringValue(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

function firstNumber(...values: unknown[]): number | undefined {
  return values.find((value): value is number => typeof value === "number" && Number.isFinite(value));
}

/* ── Authentication ──────────────────────────────────────────────── */

export const authApi = {
  /** Public User Service login. This must not go through the DMS `/api/auth/login` proxy. */
  login: async (email: string, password: string): Promise<AuthLoginResponse> => {
    const raw = await userManagementFetch<unknown>("/api/user/login", {
      method: "POST",
      body: { email, password },
    });
    return normalizeUserManagementLogin(raw);
  },
  /** Resolve DMS tenant memberships after the User Service has authenticated the user. */
  resolveTenants: async (login: AuthLoginResponse): Promise<AuthLoginResponse> => {
    const temporarySession: Session = {
      scope: "platform",
      tenantId: "",
      userId: login.user.userId,
      userName: login.user.displayName || login.user.email,
      roles: login.roles?.length ? login.roles : [login.role],
      accessToken: login.accessToken,
      refreshToken: login.refreshToken,
      idToken: login.idToken,
      expiresAt: login.expiresIn ? Math.floor(Date.now() / 1000) + login.expiresIn : undefined,
      signedInAt: new Date().toISOString(),
    };
    try {
      const result = await apiFetch<{ tenants: Array<Tenant & { role?: string }> }>("/tenants/mine", {
        session: temporarySession,
      });
      return {
        ...login,
        tenants: (result.tenants || []).map((tenant) => ({
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          role: tenant.role || login.role,
        })),
      };
    } catch (error) {
      // Some deployments return tenant memberships from the User Service login
      // response. Preserve those if the optional DMS enrichment endpoint is not
      // deployed yet; otherwise surface the DMS API error to the user.
      if (login.tenants.length) return login;
      throw error;
    }
  },
  /** Refresh through a browser-reachable Keycloak token endpoint when configured. */
  refresh: async (refreshToken: string): Promise<AuthRefreshResponse> => {
    if (!KEYCLOAK_TOKEN_URL) {
      return apiFetch<AuthRefreshResponse>("/auth/refresh", {
        method: "POST",
        body: { refreshToken },
        anonymous: true,
        headers: { "x-app-id": APP_ID },
      });
    }
    const response = await fetch(KEYCLOAK_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: KEYCLOAK_CLIENT_ID,
        refresh_token: refreshToken,
      }).toString(),
    });
    const body = await readResponseBody(response);
    if (!response.ok) throw apiErrorFromResponse(response.status, body, "Token refresh failed");
    return normalizeRefreshResponse(body);
  },
  logout: async (refreshToken: string, idToken?: string): Promise<void> => {
    // Browser logout uses the OIDC end-session URL when an id_token is
    // available. The DMS proxy remains the fallback for confidential clients.
    if (KEYCLOAK_LOGOUT_URL && idToken) {
      const url = new URL(KEYCLOAK_LOGOUT_URL);
      url.searchParams.set("post_logout_redirect_uri", `${window.location.origin}/login`);
      url.searchParams.set("id_token_hint", idToken);
      try {
        const response = await fetch(url.toString(), { method: "GET", credentials: "omit" });
        if (response.ok || response.status === 302 || response.status === 303) return;
      } catch {
        // Fall through to the DMS server-side revocation endpoint.
      }
    }
    await apiFetch<void>("/auth/logout", {
      method: "POST",
      body: { refreshToken, idToken },
      anonymous: true,
      headers: { "x-app-id": APP_ID },
    });
  },
  signup: (body: {
    email: string;
    password: string;
    username: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    gender?: string;
    address?: string;
    additionalDetails?: Record<string, unknown>;
  }) =>
    userManagementFetch<unknown>("/api/user/", {
      method: "POST",
      body,
    }),
};

/* ── Platform ─────────────────────────────────────────────────────── */

export const platformApi = {
  health: () => apiFetch<HealthResponse>("/health", { anonymous: true }),
  metrics: () => apiFetch<MetricsSnapshot>("/metrics", { anonymous: true }),
  resolveWorkspace: (workspace: string, user?: string) =>
    apiFetch<{
      workspace: { id: string; name: string; slug: string; status: TenantStatus };
      roles: string[];
    }>("/workspaces/resolve", { method: "POST", body: { workspace, user }, anonymous: true }),
};

/* ── Tenants ──────────────────────────────────────────────────────── */

export const tenantsApi = {
  list: () => apiFetch<{ tenants: Tenant[] }>("/tenants"),
  mine: () => apiFetch<{ tenants: Array<Tenant & { role: string }> }>("/tenants/mine"),
  me: (tenantId?: string) =>
    apiFetch<{ tenant: Tenant; storage?: TenantStorageConfig | null }>("/tenants/me", { tenantId }),
  get: (id: string) =>
    apiFetch<{ tenant: Tenant; storage?: TenantStorageConfig | null }>(`/tenants/${id}`, {
      tenantId: id,
    }),
  analytics: (id: string) =>
    apiFetch<{ analytics: TenantAnalytics }>(`/tenants/${id}/analytics`, { tenantId: id }),
  users: (id: string) => apiFetch<{ users: TenantUser[] }>(`/tenants/${id}/users`, { tenantId: id }),
  addUser: (id: string, body: { userId?: string; email?: string; roleId: string; role?: string }) =>
    apiFetch<{ membership: { tenantId: string; userId: string; role: string } }>(`/tenants/${id}/users`, {
      method: "POST",
      body,
      tenantId: id,
    }),
  updateUserRole: (id: string, userId: string, body: { roleId: string; role?: string }) =>
    apiFetch<{ membership: { tenantId: string; userId: string; role: string } }>(
      `/tenants/${id}/users/${encodeURIComponent(userId)}/role`,
      { method: "PUT", body, tenantId: id }
    ),
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
    return `/api/documents/${id}/content${query ? `?${query}` : ""}`;
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
