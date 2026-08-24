import { createPublicKey, KeyObject } from "crypto";
import jwt, { JwtHeader, JwtPayload } from "jsonwebtoken";
import { settings } from "./settings";

export interface KeycloakClaims {
  sub: string;
  email: string;
  preferred_username: string;
  given_name?: string;
  family_name?: string;
  realm_access?: { roles: string[] };
  tenant_id?: string;
  [claim: string]: unknown;
}

interface JsonWebKeyRecord {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n: string;
  e: string;
  [key: string]: unknown;
}

interface JwksResponse {
  keys?: JsonWebKeyRecord[];
}

const MAX_CACHE_AGE_MS = 60 * 60 * 1000;

interface IssuerKeyCache {
  keys: Map<string, KeyObject>;
  cachedAt: number;
}

// Signing keys are cached per issuer so a key id from realm A can never be
// confused with a key id from realm B / another provider.
const keyCacheByIssuer = new Map<string, IssuerKeyCache>();
const refreshInFlightByIssuer = new Map<string, Promise<Map<string, KeyObject>>>();

/**
 * Verifies an access token issued by any of the trusted issuers.
 *
 * The token's `iss` claim selects the issuer; DMS fetches that issuer's signing
 * keys from its JWKS URI and verifies the RS256 signature, issuer, audience and
 * expiry. The DMS realm is always trusted; partner realms and other OIDC
 * providers (Auth0, Azure AD, Okta, Cognito, …) are added through
 * KEYCLOAK_TRUSTED_ISSUERS. See docs/PARTNER_INTEGRATION_GUIDE_V2.md.
 *
 * Verification proves identity only; the caller's role is resolved server-side
 * by the role resolver (User Management Service + tenant_members), never from
 * token claims.
 */
export async function verifyAccessToken(token: string): Promise<KeycloakClaims> {
  const header = readJwtHeader(token);
  if (header.alg !== "RS256") {
    throw new Error("Only RS256 access tokens are accepted");
  }
  if (!header.kid) {
    throw new Error("Access token has no signing key id");
  }

  // Decode (not verify) the payload to learn which issuer signed the token.
  const unverified = readJwtPayload(token);
  const issuer = typeof unverified.iss === "string" ? unverified.iss : "";
  const jwksUris = settings.keycloak.trustedIssuers[issuer];
  if (!jwksUris || jwksUris.length === 0) {
    throw new Error("Access token issuer is not trusted");
  }

  let keys = await getKeys(issuer, jwksUris);
  let key = keys.get(header.kid);
  if (!key) {
    // Issuers rotate signing keys. Refresh once on a kid miss, then fail closed.
    keys = await getKeys(issuer, jwksUris, true);
    key = keys.get(header.kid);
  }
  if (!key) {
    throw new Error("Access token signing key was not found");
  }

  const trustedIssuerKeys = Object.keys(settings.keycloak.trustedIssuers) as [string, ...string[]];
  const verified = jwt.verify(token, key, {
    algorithms: ["RS256"],
    issuer: trustedIssuerKeys,
    clockTolerance: settings.keycloak.clockToleranceSeconds,
  });
  if (typeof verified === "string") {
    throw new Error("Invalid access token payload");
  }

  const payload = verified as JwtPayload;
  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("Access token has no subject");
  }
  if (typeof payload.exp !== "number") {
    throw new Error("Access token has no expiry");
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    throw new Error("Access token has expired");
  }
  if (typeof payload.iat === "number" && payload.iat > now + settings.keycloak.clockToleranceSeconds) {
    throw new Error("Access token was issued in the future");
  }
  if (!audienceContainsClient(payload.aud, payload.azp)) {
    throw new Error("Access token was not issued for this application");
  }

  // Authentication is complete. The subject is the only identity fact taken
  // from the token; authorization (role) is resolved separately.

  const realmAccess = payload.realm_access;
  return {
    ...payload,
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email : "",
    preferred_username:
      typeof payload.preferred_username === "string"
        ? payload.preferred_username
        : typeof payload.email === "string"
          ? payload.email
          : payload.sub,
    given_name: typeof payload.given_name === "string" ? payload.given_name : undefined,
    family_name: typeof payload.family_name === "string" ? payload.family_name : undefined,
    realm_access:
      realmAccess && typeof realmAccess === "object" && Array.isArray((realmAccess as { roles?: unknown }).roles)
        ? { roles: ((realmAccess as { roles: unknown[] }).roles || []).map(String) }
        : undefined,
    tenant_id: typeof payload.tenant_id === "string" ? payload.tenant_id : undefined,
  };
}

/** Clears the verifier cache; useful for controlled key rotation and tests. */
export function clearKeycloakKeyCache(): void {
  keyCacheByIssuer.clear();
  refreshInFlightByIssuer.clear();
}

function audienceContainsClient(audience: string | string[] | undefined, azp: unknown): boolean {
  const allowed = settings.keycloak.allowedClientIds;
  const audiences = Array.isArray(audience) ? audience : typeof audience === "string" ? [audience] : [];
  // Accept when the audience (aud) or the authorized party (azp) names any
  // client the deployment trusts. The DMS client is always in the list; tenant
  // integration clients and other providers' client/resource ids are added via
  // KEYCLOAK_ALLOWED_CLIENT_IDS.
  return (
    audiences.some((value) => allowed.includes(value)) ||
    (typeof azp === "string" && allowed.includes(azp))
  );
}

async function getKeys(
  issuer: string,
  jwksUris: string[],
  forceRefresh = false
): Promise<Map<string, KeyObject>> {
  const entry = keyCacheByIssuer.get(issuer);
  const fresh = entry && Date.now() - entry.cachedAt < MAX_CACHE_AGE_MS;
  if (!forceRefresh && fresh) return entry!.keys;
  const inFlight = refreshInFlightByIssuer.get(issuer);
  if (inFlight) return inFlight;

  const promise = fetchJwks(jwksUris)
    .then((keys) => {
      keyCacheByIssuer.set(issuer, { keys, cachedAt: Date.now() });
      return keys;
    })
    .finally(() => {
      refreshInFlightByIssuer.delete(issuer);
    });
  refreshInFlightByIssuer.set(issuer, promise);
  return promise;
}

async function fetchJwks(jwksUris: string[]): Promise<Map<string, KeyObject>> {
  let lastError: Error | undefined;
  for (const uri of jwksUris) {
    try {
      const response = await fetch(uri, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`JWKS request failed with status ${response.status}`);
      const body = (await response.json()) as JwksResponse;
      const keys = new Map<string, KeyObject>();
      for (const jwk of body.keys || []) {
        if (!jwk.kid || jwk.kty !== "RSA" || (jwk.alg && jwk.alg !== "RS256") || !jwk.n || !jwk.e) continue;
        try {
          const publicKey = createPublicKey({ key: jwk as any, format: "jwk" });
          keys.set(jwk.kid, publicKey);
        } catch {
          // Ignore malformed/unsupported keys and let verification fail closed.
        }
      }
      if (keys.size) return keys;
      throw new Error("JWKS contained no usable RSA keys");
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("JWKS request failed");
    }
  }
  throw lastError || new Error("JWKS request failed");
}

function readJwtHeader(token: string): JwtHeader {
  const [encodedHeader, encodedPayload, signature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature) throw new Error("Malformed access token");
  try {
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as JwtHeader;
    if (!header || typeof header !== "object") throw new Error("Invalid JWT header");
    return header;
  } catch {
    throw new Error("Invalid JWT header");
  }
}

/** Decodes (does NOT verify) the payload so the issuer can be selected first. */
function readJwtPayload(token: string): Record<string, unknown> {
  const encodedPayload = token.split(".")[1];
  if (!encodedPayload) return {};
  try {
    return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}
