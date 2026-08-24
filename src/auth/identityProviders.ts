import crypto from "crypto";
import jwt from "jsonwebtoken";
import { settings } from "../config/settings";
import logger from "../utils/logger";
import { ValidationError } from "../utils/errors";
import { IdentityProvider, IdpUser } from "./ports";
import { SignupPayload, TokenBundle } from "./models";

const REQUEST_TIMEOUT_MS = 15_000;

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  isForm = false
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: isForm ? (body as string) : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: Record<string, unknown> = {};
    if (text) {
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        parsed = { message: text };
      }
    }
    if (!response.ok) {
      const message =
        (typeof parsed.message === "string" && parsed.message) ||
        (typeof parsed.error === "string" && parsed.error) ||
        `Identity provider returned ${response.status}`;
      const error = new Error(message) as Error & { statusCode?: number };
      error.statusCode = response.status;
      throw error;
    }
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Production identity provider: the central User Service (backed by Keycloak).
 *
 * - login/signup talk to the User Service with the x-app-id header.
 * - refresh and logout use Keycloak's standard OpenID Connect endpoints with
 *   the DMS client credentials.
 */
export class UserMgtIdentityProvider implements IdentityProvider {
  readonly name = "user-service";

  constructor(
    private readonly appId: string,
    private readonly baseUrl: string,
    private readonly keycloak: {
      baseUrl: string;
      realm: string;
      clientId: string;
      clientSecret: string;
    }
  ) {}

  private get headers(): Record<string, string> {
    return { "content-type": "application/json", "x-app-id": this.appId };
  }

  private get tokenUrl(): string {
    return `${this.keycloak.baseUrl.replace(/\/+$/, "")}/realms/${this.keycloak.realm}/protocol/openid-connect/token`;
  }

  private get logoutUrl(): string {
    return `${this.keycloak.baseUrl.replace(/\/+$/, "")}/realms/${this.keycloak.realm}/protocol/openid-connect/logout`;
  }

  async login(email: string, password: string): Promise<TokenBundle & { user?: IdpUser }> {
    const raw = await postJson(`${this.baseUrl.replace(/\/+$/, "")}/api/user/login`, this.headers, {
      email,
      password,
    });
    const body = (raw.data && typeof raw.data === "object" ? raw.data : raw) as Record<string, unknown>;
    const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";
    const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";
    if (!accessToken || !refreshToken) {
      throw new Error("Identity provider did not return tokens");
    }
    return {
      accessToken,
      refreshToken,
      idToken: typeof body.idToken === "string" ? body.idToken : undefined,
      expiresIn: Number(body.expiresIn) > 0 ? Number(body.expiresIn) : 300,
      user: (body.user && typeof body.user === "object" ? body.user : undefined) as
        | IdpUser
        | undefined,
    };
  }

  async signup(payload: SignupPayload): Promise<void> {
    const raw = await postJson(
      `${this.baseUrl.replace(/\/+$/, "")}/api/user/`,
      this.headers,
      payload
    );
    const code = Number(raw.code);
    if (Number.isFinite(code) && code !== 0) {
      const message = typeof raw.message === "string" ? raw.message : "Signup was rejected";
      throw new ValidationError(message);
    }
  }

  async refresh(refreshToken: string): Promise<TokenBundle> {
    if (!this.keycloak.clientSecret) {
      throw new Error("KEYCLOAK_CLIENT_SECRET is not configured");
    }
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.keycloak.clientId,
      client_secret: this.keycloak.clientSecret,
      refresh_token: refreshToken,
    });
    const body = await postJson(
      this.tokenUrl,
      { "content-type": "application/x-www-form-urlencoded" },
      form.toString(),
      true
    );
    const accessToken = typeof body.access_token === "string" ? body.access_token : "";
    const nextRefresh = typeof body.refresh_token === "string" ? body.refresh_token : refreshToken;
    if (!accessToken) {
      throw new Error("Token refresh was rejected");
    }
    return {
      accessToken,
      refreshToken: nextRefresh,
      idToken: typeof body.id_token === "string" ? body.id_token : undefined,
      expiresIn: Number(body.expires_in) > 0 ? Number(body.expires_in) : 300,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    if (!this.keycloak.clientSecret || !refreshToken) return;
    try {
      const form = new URLSearchParams({
        client_id: this.keycloak.clientId,
        client_secret: this.keycloak.clientSecret,
        refresh_token: refreshToken,
      });
      await postJson(
        this.logoutUrl,
        { "content-type": "application/x-www-form-urlencoded" },
        form.toString(),
        true
      );
    } catch (error) {
      // Logout is best-effort: the local cookies are cleared regardless.
      logger.warn("keycloak_logout_failed", { message: (error as Error).message });
    }
  }
}

export interface DevUserRecord {
  userId: string;
  email: string;
  username: string;
  displayName: string;
  password: string;
  isPlatformAdmin: boolean;
}

/**
 * Development/preview identity provider. Accounts live in memory and access
 * tokens are HMAC-signed with JWT_SECRET, verified by HmacTokenVerifier.
 * Active only when AUTH_DISABLED=true (the documented preview mode).
 */
export class DevIdentityProvider implements IdentityProvider {
  readonly name = "dev";
  private readonly refreshTokens = new Map<string, string>();

  constructor(
    private readonly secret: string,
    private readonly users: DevUserRecord[] = []
  ) {}

  addUser(user: DevUserRecord): void {
    this.users.push(user);
  }

  private find(email: string): DevUserRecord | undefined {
    const needle = email.trim().toLowerCase();
    return this.users.find((user) => user.email === needle);
  }

  private sign(user: DevUserRecord): TokenBundle {
    const expiresIn = 900;
    const accessToken = jwt.sign(
      { sub: user.userId, email: user.email, preferred_username: user.username },
      this.secret,
      { algorithm: "HS256", expiresIn }
    );
    const refreshToken = crypto.randomBytes(24).toString("hex");
    this.refreshTokens.set(refreshToken, user.userId);
    return { accessToken, refreshToken, expiresIn };
  }

  async login(email: string, password: string): Promise<TokenBundle & { user?: IdpUser }> {
    const user = this.find(email);
    if (!user || user.password !== password) {
      const error = new Error("Invalid email or password") as Error & { statusCode?: number };
      error.statusCode = 401;
      throw error;
    }
    const bundle = this.sign(user);
    return {
      ...bundle,
      user: {
        userId: user.userId,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
      },
    };
  }

  async signup(payload: SignupPayload): Promise<void> {
    const email = payload.email.trim().toLowerCase();
    if (this.find(email)) {
      throw new ValidationError("An account with this email already exists");
    }
    this.users.push({
      userId: crypto.randomUUID(),
      email,
      username: payload.username || email.split("@")[0],
      displayName: [payload.firstName, payload.lastName].filter(Boolean).join(" ") || email,
      password: payload.password,
      isPlatformAdmin: false,
    });
  }

  async refresh(refreshToken: string): Promise<TokenBundle> {
    const userId = this.refreshTokens.get(refreshToken);
    const user = this.users.find((entry) => entry.userId === userId);
    if (!user) {
      const error = new Error("Refresh token is no longer valid") as Error & { statusCode?: number };
      error.statusCode = 401;
      throw error;
    }
    this.refreshTokens.delete(refreshToken);
    return this.sign(user);
  }

  async logout(refreshToken: string): Promise<void> {
    this.refreshTokens.delete(refreshToken);
  }
}

/** Wires the identity provider from environment settings. */
export function createIdentityProvider(): IdentityProvider | null {
  const auth = settings.auth;
  if (auth.userMgtBaseUrl) {
    if (!auth.keycloakBaseUrl) {
      logger.warn("user_mgt_without_keycloak", {
        hint: "Set KEYCLOAK_BASE_URL so access tokens can be verified",
      });
    }
    return new UserMgtIdentityProvider(auth.appId, auth.userMgtBaseUrl, {
      baseUrl: auth.keycloakBaseUrl,
      realm: auth.keycloakRealm,
      clientId: auth.keycloakClientId,
      clientSecret: auth.keycloakClientSecret,
    });
  }
  if (settings.authDisabled && settings.jwtSecret) {
    return new DevIdentityProvider(settings.jwtSecret);
  }
  return null;
}
