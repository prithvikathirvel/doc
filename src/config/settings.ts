import dotenv from "dotenv";

dotenv.config();

function env(name: string, fallback?: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value === "") {
    return fallback;
  }
  return value;
}

function envInt(name: string, fallback: number): number {
  const raw = env(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = env(name);
  if (raw === undefined) return fallback;
  return raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
}

const legacyAuthDisabled = envBool("AUTH_DISABLED", false);
const requestedAuthMode = (env("AUTH_MODE", legacyAuthDisabled ? "headers" : "keycloak") || "keycloak")
  .trim()
  .toLowerCase();
const authMode: "headers" | "keycloak" = requestedAuthMode === "headers" ? "headers" : "keycloak";
const keycloakBaseUrl = (env("KEYCLOAK_BASE_URL", "http://1.6.37.35/keycloak") || "").replace(/\/+$/, "");
const keycloakRealm = env("KEYCLOAK_REALM", "dms") as string;
const keycloakIssuer =
  env("KEYCLOAK_ISSUER", `${keycloakBaseUrl}/realms/${encodeURIComponent(keycloakRealm)}`) as string;
const keycloakJwksUri =
  env(
    "KEYCLOAK_JWKS_URI",
    `${keycloakBaseUrl}/realms/${encodeURIComponent(keycloakRealm)}/protocol/openid-connect/certs`
  ) as string;
const keycloakJwksUris = keycloakJwksUri
  .split(",")
  .map((uri) => uri.trim())
  .filter(Boolean);

const dmsAppId = env("DMS_APP_ID", "DMS") as string;
const dmsAppClientId = env("DMS_APP_CLIENT_ID", "dms-web") as string;

/**
 * Clients whose `azp` / `aud` are accepted on incoming access tokens.
 *
 * Always allowed:
 *   - the DMS browser client (DMS_APP_CLIENT_ID), and
 *   - the DMS application id (DMS_APP_ID) — in the Sify deployment the Keycloak
 *     client that mints user tokens is named "DMS" (the access token's `azp` is
 *     literally "DMS"), so the app id is a trusted client too.
 *
 * Additional clients (tenant integrations) are added through
 * KEYCLOAK_ALLOWED_CLIENT_IDS. Signature and issuer are still verified, so
 * accepting a client id here only relaxes the audience check.
 */
const keycloakAllowedClientIds = Array.from(
  new Set(
    [
      ...(env("KEYCLOAK_ALLOWED_CLIENT_IDS", "") || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
      dmsAppClientId,
      dmsAppId,
    ].filter(Boolean)
  )
);

export const settings = {
  port: envInt("PORT", 3000),
  host: env("HOST", "0.0.0.0") as string,
  jwtSecret: env("JWT_SECRET"),

  /** `headers` is the explicit local/dev compatibility mode. */
  authMode,
  /** Kept as a compatibility alias for older deployments and scripts. */
  authDisabled: authMode === "headers",
  authAllowDevHeaders: envBool("AUTH_ALLOW_DEV_HEADERS", authMode === "headers"),
  allowPublicSignup: envBool("ALLOW_PUBLIC_SIGNUP", false),

  userManagement: {
    baseUrl: (env("USER_MGT_BASE_URL", "https://apidev.sifymodernization.digital/user-mgt") || "").replace(/\/+$/, ""),
  },
  // Flat aliases keep configuration consumption convenient for controllers and
  // are also compatible with the names used in deployment manifests.
  userMgtBaseUrl: (env("USER_MGT_BASE_URL", "https://apidev.sifymodernization.digital/user-mgt") || "").replace(/\/+$/, ""),
  dmsAppId,
  dmsAppClientId,
  dmsAppClientSecret: env("DMS_APP_CLIENT_SECRET", ""),
  dmsWebOrigin: (env("DMS_WEB_ORIGIN", "http://localhost:3000") || "").replace(/\/+$/, ""),
  corsAllowedOrigins: (env("CORS_ALLOWED_ORIGINS") || env("DMS_WEB_ORIGIN", "http://localhost:3000") || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean),
  publicApiPath: (env("PUBLIC_API_PATH", "/api") || "/api").replace(/\/+$/, "") || "/api",

  keycloak: {
    baseUrl: keycloakBaseUrl,
    realm: keycloakRealm,
    jwksUri: keycloakJwksUri,
    jwksUris: keycloakJwksUris,
    issuer: keycloakIssuer,
    clockToleranceSeconds: envInt("KEYCLOAK_CLOCK_TOLERANCE", 15),
    /**
     * Clients accepted in the `azp` / `aud` claim. The DMS client is always
     * present; tenant integration clients are added through
     * KEYCLOAK_ALLOWED_CLIENT_IDS.
     */
    allowedClientIds: keycloakAllowedClientIds,
  },
  keycloakBaseUrl,
  keycloakRealm,
  keycloakJwksUri,
  keycloakJwksUris,
  keycloakIssuer,
  keycloakClockTolerance: envInt("KEYCLOAK_CLOCK_TOLERANCE", 15),
  keycloakAllowedClientIds,

  /**
   * Authoritative role resolution. Roles are never trusted from the access
   * token; they are resolved per request from the User Management Service and
   * the DMS tenant_members table, cached briefly per user for performance.
   */
  roleResolver: {
    enabled: envBool("ROLE_RESOLVER_ENABLED", true),
    /** Per-user cache TTL in seconds. Keep short so role changes propagate. */
    cacheTtlSeconds: envInt("ROLE_CACHE_TTL_SECONDS", 60),
  },

  mysql: {
    host: env("MYSQL_HOST", "localhost") as string,
    port: envInt("MYSQL_PORT", 3306),
    user: env("MYSQL_USER", "root") as string,
    password: env("MYSQL_PASSWORD", ""),
    database: env("MYSQL_DB", "dms") as string,
  },
  defaultSignedUrlTtlSeconds: envInt("SIGNED_URL_TTL_SECONDS", 900),
  maxUploadBytes: envInt("MAX_UPLOAD_BYTES", 100 * 1024 * 1024),
};

export function resolveSecret(ref?: string): string | undefined {
  if (!ref) return undefined;
  if (ref.startsWith("env:")) {
    return process.env[ref.slice(4)];
  }
  return process.env[ref] ?? ref;
}
