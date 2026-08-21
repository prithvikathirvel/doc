import { generateKeyPairSync, KeyObject } from "crypto";
import jwt from "jsonwebtoken";
import { clearKeycloakKeyCache, verifyAccessToken } from "../../config/keycloak";
import { settings } from "../../config/settings";

const originalFetch = global.fetch;
const originalIssuer = settings.keycloak.issuer;
const originalJwksUri = settings.keycloak.jwksUri;
const originalJwksUris = settings.keycloak.jwksUris;
const originalClientId = settings.dmsAppClientId;

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
  settings.dmsAppClientId = originalClientId;
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
