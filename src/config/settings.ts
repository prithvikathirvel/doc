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
  dmsAppId: env("DMS_APP_ID", "DMS") as string,
  dmsAppClientId: env("DMS_APP_CLIENT_ID", "dms-web") as string,
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
  },
  keycloakBaseUrl,
  keycloakRealm,
  keycloakJwksUri,
  keycloakJwksUris,
  keycloakIssuer,
  keycloakClockTolerance: envInt("KEYCLOAK_CLOCK_TOLERANCE", 15),

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
