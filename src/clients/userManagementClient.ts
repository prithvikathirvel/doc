import { settings } from "../config/settings";

export interface UserMgtUser {
  userId: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  isActive?: boolean;
}

export interface UserMgtAppUser {
  user: UserMgtUser;
  roles: string[];
  roleIds?: string[];
}

export interface UserMgtLoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  refreshExpiresIn?: number;
  idToken?: string;
  user?: UserMgtUser;
  application?: unknown;
  raw: unknown;
}

export interface UserMgtSignupInput {
  email: string;
  password: string;
  username: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  gender?: string;
  address?: string;
  additionalDetails?: Record<string, unknown>;
}

export class UserManagementError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly responseBody?: unknown
  ) {
    super(message);
    this.name = "UserManagementError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type TokenProvider = () => Promise<string>;

export type UserManagementClientOptions = {
  tokenProvider?: TokenProvider;
  tokenEndpoint?: string;
  clientId?: string;
  clientSecret?: string;
};

interface CachedServiceToken {
  token: string;
  expiresAt: number;
}

/**
 * Server-side client for the Sify User Management Service.
 *
 * Login and sign-up are unauthenticated User Service operations (they still
 * carry x-app-id). Administrative lookups use a cached client-credentials
 * token; the client secret is never exposed to the browser.
 */
export class UserManagementClient {
  private serviceToken: CachedServiceToken | null = null;
  private serviceTokenInFlight: Promise<string> | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly appId: string,
    private readonly options: UserManagementClientOptions = {}
  ) {}

  async login(email: string, password: string): Promise<UserMgtLoginResponse> {
    const raw = await this.request<unknown>("/api/user/login", {
      method: "POST",
      body: { email, password },
      authenticated: false,
    });
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
      throw new UserManagementError(502, "User Management Service returned no login tokens", raw);
    }

    const user = normalizeUser(data.user || data.profile || source.user || source.profile || data);
    return {
      accessToken,
      refreshToken,
      expiresIn: numberValue(
        data.expiresIn,
        data.expires_in,
        tokens.expiresIn,
        tokens.expires_in,
        source.expiresIn,
        source.expires_in
      ),
      refreshExpiresIn: numberValue(
        data.refreshExpiresIn,
        data.refresh_expires_in,
        tokens.refreshExpiresIn,
        tokens.refresh_expires_in,
        source.refreshExpiresIn,
        source.refresh_expires_in
      ),
      idToken: stringValue(data.idToken, data.id_token, tokens.idToken, tokens.id_token, source.idToken, source.id_token),
      user: user.userId ? user : undefined,
      application: data.application || data.applicationInformation || source.application || source.applicationInformation,
      raw,
    };
  }

  async signup(input: UserMgtSignupInput): Promise<unknown> {
    return this.request<unknown>("/api/user/", {
      method: "POST",
      body: input,
      authenticated: false,
    });
  }

  async getUser(userId: string): Promise<UserMgtUser> {
    const raw = await this.request<unknown>(`/api/user/${encodeURIComponent(userId)}`);
    const user = normalizeUser(raw);
    if (!user.userId) throw new UserManagementError(502, "User Management Service returned an invalid user", raw);
    return user;
  }

  async findByEmail(email: string): Promise<UserMgtUser | null> {
    const raw = await this.request<unknown>(`/api/user?email=${encodeURIComponent(email)}`);
    const source = asRecord(raw);
    const data = asRecord(source.data);
    const candidates = Array.isArray(raw)
      ? raw
      : Array.isArray(source.users)
        ? source.users
        : Array.isArray(data.users)
          ? data.users
          : Array.isArray(source.data)
            ? source.data
            : source.user
              ? [source.user]
              : data.user
                ? [data.user]
                : source.data
                  ? [source.data]
                  : [];
    return candidates.length ? normalizeUser(candidates[0]) : null;
  }

  async listUsersForApp(): Promise<UserMgtUser[]> {
    const users = await this.listUsersWithRoles();
    return users.map((item) => item.user);
  }

  async listUsersWithRoles(): Promise<UserMgtAppUser[]> {
    const raw = await this.request<unknown>(`/api/role/${encodeURIComponent(this.appId)}`);
    const source = asRecord(raw);
    const data = asRecord(source.data);
    const candidates = Array.isArray(raw)
      ? raw
      : Array.isArray(source.users)
        ? source.users
        : Array.isArray(data.users)
          ? data.users
          : Array.isArray(source.data)
            ? source.data
            : Array.isArray(source.results)
              ? source.results
              : Array.isArray(data.results)
                ? data.results
                : [];

    return candidates
      .map((item) => {
        const record = asRecord(item);
        const user = normalizeUser(record.user || record);
        const roles = normalizeRoleNames(record.roles || record.role || record.userRoles);
        const roleIds = normalizeRoleIds(record.roles || record.role || record.userRoles);
        return { user, roles, roleIds: roleIds.length ? roleIds : undefined };
      })
      .filter((item) => Boolean(item.user.userId));
  }

  async assignRole(userId: string, roleId: string): Promise<void> {
    await this.request<unknown>("/api/user-app-roles", {
      method: "POST",
      body: { appId: this.appId, userId, roleId },
    });
  }

  async updateRole(userId: string, roleId: string): Promise<void> {
    await this.request<unknown>(`/api/user-app-roles/${encodeURIComponent(userId)}/${encodeURIComponent(this.appId)}`, {
      method: "PUT",
      body: { roleId },
    });
  }

  private async request<T>(
    path: string,
    options: { method?: string; body?: unknown; authenticated?: boolean } = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      accept: "application/json",
      "x-app-id": this.appId,
    };
    if (options.body !== undefined) headers["content-type"] = "application/json";
    if (options.authenticated !== false) headers.authorization = `Bearer ${await this.getServiceToken()}`;

    const response = await fetch(`${this.baseUrl.replace(/\/+$/, "")}${path}`, {
      method: options.method || (options.body === undefined ? "GET" : "POST"),
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    let body: unknown = undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!response.ok) {
      const record = asRecord(body);
      const message = stringValue(record.message, record.error, record.detail) || "User Management Service request failed";
      throw new UserManagementError(response.status, message, body);
    }
    return body as T;
  }

  private async getServiceToken(): Promise<string> {
    if (this.options.tokenProvider) return this.options.tokenProvider();
    const now = Math.floor(Date.now() / 1000);
    if (this.serviceToken && this.serviceToken.expiresAt > now + 60) return this.serviceToken.token;
    if (this.serviceTokenInFlight) return this.serviceTokenInFlight;

    const clientId = this.options.clientId || settings.dmsAppClientId;
    const clientSecret = this.options.clientSecret ?? settings.dmsAppClientSecret;
    if (!clientId || !clientSecret) {
      throw new UserManagementError(500, "DMS service-account credentials are not configured");
    }
    const tokenEndpoint =
      this.options.tokenEndpoint ||
      `${settings.keycloak.baseUrl}/realms/${encodeURIComponent(settings.keycloak.realm)}/protocol/openid-connect/token`;

    this.serviceTokenInFlight = (async () => {
      const form = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      });
      const response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const text = await response.text();
      let body: unknown = undefined;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
      if (!response.ok) {
        throw new UserManagementError(response.status, "Could not obtain the DMS service-account token", body);
      }
      const record = asRecord(body);
      const token = stringValue(record.access_token, record.accessToken);
      if (!token) throw new UserManagementError(502, "Keycloak returned no service-account token", body);
      const expiresIn = numberValue(record.expires_in, record.expiresIn) || 300;
      this.serviceToken = { token, expiresAt: now + expiresIn };
      return token;
    })().finally(() => {
      this.serviceTokenInFlight = null;
    });

    return this.serviceTokenInFlight;
  }
}

export function createUserManagementClient(): UserManagementClient {
  return new UserManagementClient(settings.userManagement.baseUrl, settings.dmsAppId);
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function stringValue(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

function numberValue(...values: unknown[]): number | undefined {
  return values.find((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function normalizeUser(value: unknown): UserMgtUser {
  const record = asRecord(value);
  const nested = asRecord(record.user || record.profile || record.data);
  const source = Object.keys(nested).length ? { ...record, ...nested } : record;
  return {
    userId: stringValue(source.userId, source.user_id, source.id, source.sub) || "",
    email: stringValue(source.email, source.mail) || "",
    username: stringValue(source.username, source.userName, source.preferred_username, source.email) || "",
    firstName: stringValue(source.firstName, source.first_name, source.given_name),
    lastName: stringValue(source.lastName, source.last_name, source.family_name),
    phone: stringValue(source.phone, source.phoneNumber),
    isActive: typeof source.isActive === "boolean" ? source.isActive : typeof source.active === "boolean" ? source.active : undefined,
  };
}

function normalizeRoleNames(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .map((role) => {
      const record = asRecord(role);
      return stringValue(record.roleName, record.name, record.role, role);
    })
    .filter((role): role is string => Boolean(role));
}

function normalizeRoleIds(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .map((role) => {
      const record = asRecord(role);
      return stringValue(record.roleId, record.id);
    })
    .filter((role): role is string => Boolean(role));
}
