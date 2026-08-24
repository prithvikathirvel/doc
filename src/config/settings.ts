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

export const settings = {
  port: envInt("PORT", 3000),
  host: env("HOST", "0.0.0.0") as string,
  jwtSecret: env("JWT_SECRET"),
  authDisabled: envBool("AUTH_DISABLED", false),
  auth: {
    /** Value sent as x-app-id to the central User Service. */
    appId: env("DMS_APP_ID", "DMS") as string,
    /** Base URL of the central User Service, e.g. https://apidev.sifymodernization.digital/user-mgt */
    userMgtBaseUrl: env("USER_MGT_BASE_URL", "") as string,
    /** Keycloak base URL, e.g. http://1.6.37.35/keycloak. Enables JWKS token verification. */
    keycloakBaseUrl: env("KEYCLOAK_BASE_URL", "") as string,
    keycloakRealm: env("KEYCLOAK_REALM", "DMS") as string,
    keycloakClientId: env("KEYCLOAK_CLIENT_ID", "DMS") as string,
    keycloakClientSecret: env("KEYCLOAK_CLIENT_SECRET", "") as string,
    /** Reject tokens whose issuer does not match the configured realm. */
    strictIssuer: envBool("KEYCLOAK_STRICT_ISSUER", false),
    /** Bootstrap platform administrators; persisted to dms_users on first sign-in. */
    platformAdminEmails: (env("DMS_PLATFORM_ADMINS", "") || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    /** Lifetime of the refresh-token cookie. */
    refreshCookieMaxAgeSeconds: envInt("DMS_REFRESH_COOKIE_MAX_AGE_SECONDS", 7 * 24 * 60 * 60),
    /** 'true'/'false' force the Secure cookie flag; unset auto-detects per request. */
    cookieSecure: (env("DMS_COOKIE_SECURE", "auto") || "auto").toLowerCase(),
    loginRateLimit: {
      windowSeconds: envInt("DMS_LOGIN_RATE_WINDOW_SECONDS", 300),
      max: envInt("DMS_LOGIN_RATE_MAX", 10),
    },
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
