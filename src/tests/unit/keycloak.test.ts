import { generateKeyPairSync, KeyObject } from "crypto";
import jwt from "jsonwebtoken";
import { clearKeycloakKeyCache, verifyAccessToken } from "../../config/keycloak";
import { settings } from "../../config/settings";

const originalFetch = global.fetch;
const originalIssuer = settings.keycloak.issuer;
const originalJwksUri = settings.keycloak.jwksUri;
const originalJwksUris = settings.keycloak.jwksUris;
const originalClientId = settings.dmsAppClientId;
const originalAllowedClientIds = [...settings.keycloak.allowedClientIds];
const originalTrustedIssuers = { ...settings.keycloak.trustedIssuers };

let privateKey: KeyObject;
let jwks: Record<string, unknown>;

beforeAll(() => {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  privateKey = pair.privateKey;
  const publicJwk = pair.publicKey.export({ format: "jwk" }) as Record<string, unknown>;
  jwks = { ...publicJwk, kid: "test-key", alg: "RS256", use: "sig", kty: "RSA" };
  settings.keycloak.issuer = "https://issuer.example/realms/dms";
  settings.keycloak.jwksUri = "https://issuer.example/realms/dms/protocol/openid-connect/certs";
  settings.keycloak.jwksUris = [settings.keycloak.jwksUri];
  settings.keycloak.trustedIssuers = { [settings.keycloak.issuer]: settings.keycloak.jwksUris };
  settings.dmsAppClientId = "dms-web";
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ keys: [jwks] }),
  })) as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
  settings.keycloak.issuer = originalIssuer;
  settings.keycloak.jwksUri = originalJwksUri;
  settings.keycloak.jwksUris = originalJwksUris;
  settings.keycloak.trustedIssuers = originalTrustedIssuers;
  settings.dmsAppClientId = originalClientId;
  settings.keycloak.allowedClientIds = originalAllowedClientIds;
});

beforeEach(() => clearKeycloakKeyCache());

test("verifies a signed RS256 token and accepts the configured client in azp", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    {
      sub: "user-1",
      email: "user@example.com",
      preferred_username: "user",
      realm_access: { roles: ["Member"] },
      iss: settings.keycloak.issuer,
      aud: "account",
      azp: settings.dmsAppClientId,
      iat: now,
      exp: now + 300,
    },
    privateKey,
    { algorithm: "RS256", keyid: "test-key" }
  );

  await expect(verifyAccessToken(token)).resolves.toMatchObject({
    sub: "user-1",
    email: "user@example.com",
  });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test("rejects expired and wrong-audience tokens", async () => {
  const now = Math.floor(Date.now() / 1000);
  const expired = jwt.sign(
    { sub: "user-1", iss: settings.keycloak.issuer, aud: settings.dmsAppClientId, exp: now - 120 },
    privateKey,
    { algorithm: "RS256", keyid: "test-key" }
  );
  await expect(verifyAccessToken(expired)).rejects.toThrow();

  const wrongAudience = jwt.sign(
    { sub: "user-1", iss: settings.keycloak.issuer, aud: "another-client", exp: now + 300 },
    privateKey,
    { algorithm: "RS256", keyid: "test-key" }
  );
  await expect(verifyAccessToken(wrongAudience)).rejects.toThrow("application");
});

test("accepts a tenant integration client listed in the audience allowlist", async () => {
  const now = Math.floor(Date.now() / 1000);
  settings.keycloak.allowedClientIds = [settings.dmsAppClientId, "tenant-acme-service"];
  const integrationToken = jwt.sign(
    {
      sub: "tenant-user-1",
      iss: settings.keycloak.issuer,
      aud: "account",
      azp: "tenant-acme-service",
      iat: now,
      exp: now + 300,
    },
    privateKey,
    { algorithm: "RS256", keyid: "test-key" }
  );
  await expect(verifyAccessToken(integrationToken)).resolves.toMatchObject({
    sub: "tenant-user-1",
  });
});

test("rejects a client that is not in the audience allowlist", async () => {
  const now = Math.floor(Date.now() / 1000);
  const unknownClientToken = jwt.sign(
    {
      sub: "user-1",
      iss: settings.keycloak.issuer,
      aud: "account",
      azp: "rogue-client",
      iat: now,
      exp: now + 300,
    },
    privateKey,
    { algorithm: "RS256", keyid: "test-key" }
  );
  await expect(verifyAccessToken(unknownClientToken)).rejects.toThrow("application");
});

test("accepts a token from a second trusted issuer (partner realm / provider)", async () => {
  const now = Math.floor(Date.now() / 1000);
  const partnerIssuer = "http://1.6.37.35/keycloak/realms/ABC";
  const partnerJwksUri = "http://1.6.37.35/keycloak/realms/ABC/protocol/openid-connect/certs";
  settings.keycloak.trustedIssuers = {
    [settings.keycloak.issuer]: settings.keycloak.jwksUris,
    [partnerIssuer]: [partnerJwksUri],
  };
  settings.keycloak.allowedClientIds = [settings.dmsAppClientId, "partner-abc-app"];

  const token = jwt.sign(
    {
      sub: "partner-user-1",
      email: "partner@example.com",
      iss: partnerIssuer,
      aud: "account",
      azp: "partner-abc-app",
      iat: now,
      exp: now + 300,
    },
    privateKey,
    { algorithm: "RS256", keyid: "test-key" }
  );
  await expect(verifyAccessToken(token)).resolves.toMatchObject({
    sub: "partner-user-1",
    email: "partner@example.com",
  });
  // Keys were fetched from the partner issuer's JWKS URI.
  expect(global.fetch).toHaveBeenCalledWith(partnerJwksUri, expect.anything());
});

test("rejects a token whose issuer is not trusted", async () => {
  const now = Math.floor(Date.now() / 1000);
  settings.keycloak.trustedIssuers = { [settings.keycloak.issuer]: settings.keycloak.jwksUris };
  const token = jwt.sign(
    {
      sub: "user-1",
      iss: "https://evil.example/realms/rogue",
      aud: "account",
      azp: settings.dmsAppClientId,
      iat: now,
      exp: now + 300,
    },
    privateKey,
    { algorithm: "RS256", keyid: "test-key" }
  );
  await expect(verifyAccessToken(token)).rejects.toThrow("issuer is not trusted");
});
