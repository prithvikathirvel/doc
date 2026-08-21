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

let cachedKeys: Map<string, KeyObject> | null = null;
let cachedAt = 0;
let refreshInFlight: Promise<Map<string, KeyObject>> | null = null;

/**
 * Verifies a Keycloak access token using the realm's signing keys.
 *
 * The keys are deliberately cached in-process. A DMS request never calls the
 * User Management Service to validate a token; only Keycloak's public JWKS is
 * fetched when the cache is cold, stale, or a token contains a new key id.
 */
export async function verifyAccessToken(token: string): Promise<KeycloakClaims> {
  const header = readJwtHeader(token);
  if (header.alg !== "RS256") {
    throw new Error("Only RS256 access tokens are accepted");
  }
  if (!header.kid) {
    throw new Error("Access token has no signing key id");
  }

  let keys = await getKeys();
  let key = keys.get(header.kid);
  if (!key) {
    // Keycloak rotates signing keys. Refresh once on a kid miss, then fail if
    // the new key set still does not contain the requested key.
    keys = await getKeys(true);
    key = keys.get(header.kid);
  }
  if (!key) {
    throw new Error("Access token signing key was not found");
  }

  const verified = jwt.verify(token, key, {
    algorithms: ["RS256"],
    issuer: settings.keycloak.issuer,
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
  cachedKeys = null;
  cachedAt = 0;
  refreshInFlight = null;
}

function audienceContainsClient(audience: string | string[] | undefined, azp: unknown): boolean {
  const expected = settings.dmsAppClientId;
  const audiences = Array.isArray(audience) ? audience : typeof audience === "string" ? [audience] : [];
  return audiences.includes(expected) || azp === expected;
}

async function getKeys(forceRefresh = false): Promise<Map<string, KeyObject>> {
  const fresh = cachedKeys && Date.now() - cachedAt < MAX_CACHE_AGE_MS;
  if (!forceRefresh && fresh) return cachedKeys as Map<string, KeyObject>;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = fetchJwks()
    .then((keys) => {
      cachedKeys = keys;
      cachedAt = Date.now();
      return keys;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

async function fetchJwks(): Promise<Map<string, KeyObject>> {
  let lastError: Error | undefined;
  for (const uri of settings.keycloak.jwksUris || [settings.keycloak.jwksUri]) {
    try {
      const response = await fetch(uri, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`Keycloak JWKS request failed with status ${response.status}`);
      const body = (await response.json()) as JwksResponse;
      const keys = new Map<string, KeyObject>();
      for (const jwk of body.keys || []) {
        if (!jwk.kid || jwk.kty !== "RSA" || jwk.alg && jwk.alg !== "RS256" || !jwk.n || !jwk.e) continue;
        try {
          const publicKey = createPublicKey({ key: jwk as any, format: "jwk" });
          keys.set(jwk.kid, publicKey);
        } catch {
          // Ignore malformed/unsupported keys and let verification fail closed.
        }
      }
      if (keys.size) return keys;
      throw new Error("Keycloak JWKS contained no usable RSA keys");
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Keycloak JWKS request failed");
    }
  }
  throw lastError || new Error("Keycloak JWKS request failed");
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
