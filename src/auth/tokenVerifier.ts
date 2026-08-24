import crypto from "crypto";
import jwt from "jsonwebtoken";
import { settings } from "../config/settings";
import logger from "../utils/logger";
import { AccessTokenVerifier } from "./ports";

/**
 * Verifies HMAC-signed access tokens (JWT_SECRET). Used for local development
 * and the preview API; production uses KeycloakJwksVerifier.
 */
export class HmacTokenVerifier implements AccessTokenVerifier {
  constructor(private readonly secret: string) {}

  async verify(token: string): Promise<Record<string, unknown>> {
    return jwt.verify(token, this.secret, { algorithms: ["HS256"] }) as Record<string, unknown>;
  }
}

interface Jwk {
  kid?: string;
  kty: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
  x5c?: string[];
}

type FetchKeys = () => Promise<Jwk[]>;

/**
 * Verifies Keycloak access tokens against the realm's published signing keys.
 *
 * Keys are fetched once and cached; an unknown `kid` triggers exactly one
 * re-fetch (Keycloak rotates keys), and failures never fall back to decoding
 * without verification.
 */
export class KeycloakJwksVerifier implements AccessTokenVerifier {
  private keysByKid = new Map<string, Jwk>();
  private keysFetchedAt = 0;
  private inflight: Promise<void> | null = null;
  private readonly cacheTtlMs = 10 * 60 * 1000;

  constructor(
    private readonly issuer: string,
    private readonly jwksUrl: string,
    private readonly fetchKeys: FetchKeys,
    private readonly strictIssuer = false,
    options?: { algorithms?: string[]; revalidateWindowMs?: number }
  ) {
    this.algorithms = options?.algorithms || ["RS256"];
    this.revalidateWindowMs = options?.revalidateWindowMs ?? 30_000;
  }

  private algorithms: string[];
  private revalidateWindowMs: number;

  async verify(token: string): Promise<Record<string, unknown>> {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === "string") {
      throw new Error("token is not a JWT");
    }
    const header = decoded.header as { kid?: string; alg?: string };
    if (header.alg && !this.algorithms.includes(header.alg)) {
      throw new Error(`algorithm ${header.alg} is not accepted`);
    }

    const jwk = await this.keyFor(header.kid);
    const keyObject = crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: "jwk" });
    const payload = jwt.verify(token, keyObject, {
      algorithms: this.algorithms as jwt.Algorithm[],
      issuer: this.strictIssuer ? this.issuer : undefined,
    }) as Record<string, unknown>;

    if (this.strictIssuer && typeof payload.iss === "string" && payload.iss !== this.issuer) {
      throw new Error("issuer mismatch");
    }
    return payload;
  }

  private async keyFor(kid?: string): Promise<Jwk> {
    if (kid && this.keysByKid.has(kid) && Date.now() - this.keysFetchedAt < this.cacheTtlMs) {
      return this.keysByKid.get(kid) as Jwk;
    }
    // Unknown kid (rotation) or stale cache: refresh unless we just did.
    if (Date.now() - this.keysFetchedAt > this.revalidateWindowMs) {
      await this.loadKeys();
    }
    if (kid && this.keysByKid.has(kid)) {
      return this.keysByKid.get(kid) as Jwk;
    }
    if (!kid && this.keysByKid.size > 0) {
      // Tokens without a kid are verified against the first signing key.
      return [...this.keysByKid.values()][0];
    }
    throw new Error("no matching signing key");
  }

  private async loadKeys(): Promise<void> {
    if (this.inflight) {
      await this.inflight;
      return;
    }
    this.inflight = (async () => {
      try {
        const keys = await this.fetchKeys();
        const next = new Map<string, Jwk>();
        for (const key of keys) {
          if (key.kty !== "RSA") continue;
          if (key.use && key.use !== "sig") continue;
          next.set(key.kid || "", key);
        }
        if (next.size > 0) this.keysByKid = next;
        this.keysFetchedAt = Date.now();
      } catch (error) {
        logger.error("jwks_fetch_failed", {
          url: this.jwksUrl,
          message: (error as Error).message,
        });
        throw error;
      } finally {
        this.inflight = null;
      }
    })();
    await this.inflight;
  }
}

export function createKeycloakVerifier(
  keycloak: { baseUrl: string; realm: string; strictIssuer: boolean } = {
    baseUrl: settings.auth.keycloakBaseUrl,
    realm: settings.auth.keycloakRealm,
    strictIssuer: settings.auth.strictIssuer,
  }
): KeycloakJwksVerifier {
  const realmPath = `${keycloak.baseUrl.replace(/\/+$/, "")}/realms/${keycloak.realm}`;
  const jwksUrl = `${realmPath}/protocol/openid-connect/certs`;
  return new KeycloakJwksVerifier(
    realmPath,
    jwksUrl,
    async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(jwksUrl, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`JWKS endpoint returned ${response.status}`);
        }
        const body = (await response.json()) as { keys?: Jwk[] };
        return body.keys || [];
      } finally {
        clearTimeout(timeout);
      }
    },
    keycloak.strictIssuer
  );
}

/** Returns the verifier matching the configuration, or null when none applies. */
export function createVerifier(): AccessTokenVerifier | null {
  if (settings.auth.keycloakBaseUrl) {
    return createKeycloakVerifier();
  }
  if (settings.jwtSecret) {
    return new HmacTokenVerifier(settings.jwtSecret);
  }
  return null;
}
