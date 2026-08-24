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

/**
 * Trusted token issuers and their JWKS URIs. The verifier accepts a token only
 * if its `iss` claim is one of these issuers, and fetches the signing keys from
 * the matching JWKS URI.
 *
 * The DMS realm is always trusted. Additional issuers are declared with
 * KEYCLOAK_TRUSTED_ISSUERS as a comma-separated list of `issuer|jwksUri` pairs,
 * which is how partner realms (same Keycloak, different realm) and even other
 * OIDC providers (Auth0, Azure AD, Okta, Cognito, …) are supported. See
 * docs/PARTNER_INTEGRATION_GUIDE_V2.md.
 *
 * Example:
 *   KEYCLOAK_TRUSTED_ISSUERS=\
 *     http://1.6.37.35/keycloak/realms/ABC|http://1.6.37.35/keycloak/realms/ABC/protocol/openid-connect/certs,\
 *     https://login.partner.com|https://login.partner.com/.well-known/jwks.json
 */
const keycloakTrustedIssuers: Record<string, string[]> = {
  [keycloakIssuer]: keycloakJwksUris,
};
for (const entry of (env("KEYCLOAK_TRUSTED_ISSUERS", "") || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean)) {
  const [iss, jwks] = entry.split("|").map((part) => part && part.trim());
  if (iss && jwks) {
    keycloakTrustedIssuers[iss] = [...(keycloakTrustedIssuers[iss] || []), jwks];
  }
}

/** When true, a federated user (from a partner issuer) is matched to a tenant
 * membership by the email claim when their `sub` does not match. The token is
 * still signature-verified against a trusted issuer; only set this if you trust
 * the email claims of every issuer in KEYCLOAK_TRUSTED_ISSUERS. */
const federatedEmailLinking = envBool("FEDERATED_EMAIL_LINKING", true);

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
    /**
     * Trusted issuers → JWKS URIs. The DMS realm is always present; partner
     * realms and other OIDC providers are added via KEYCLOAK_TRUSTED_ISSUERS.
     */
    trustedIssuers: keycloakTrustedIssuers,
    federatedEmailLinking,
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
