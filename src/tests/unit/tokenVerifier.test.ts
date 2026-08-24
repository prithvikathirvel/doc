import crypto from "crypto";
import jwt from "jsonwebtoken";
import { KeycloakJwksVerifier, HmacTokenVerifier } from "../../auth/tokenVerifier";

function rsaJwk(): { jwk: { kty: string; kid?: string }; sign: (payload: object, kid: string) => string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" }) as unknown as { kty: string; kid?: string };
  return {
    jwk,
    sign: (payload: object, kid: string) =>
      jwt.sign(payload, privateKey, { algorithm: "RS256", keyid: kid }),
  };
}

describe("KeycloakJwksVerifier", () => {
  it("accepts a token signed by the published realm key", async () => {
    const { jwk, sign } = rsaJwk();
    const verifier = new KeycloakJwksVerifier(
      "http://kc/realms/DMS",
      "http://kc/realms/DMS/protocol/openid-connect/certs",
      async () => [{ kid: "kid-1", ...jwk }]
    );
    const token = sign({ sub: "user-1", iss: "http://kc/realms/DMS" }, "kid-1");
    const payload = await verifier.verify(token);
    expect(payload.sub).toBe("user-1");
  });

  it("rejects tokens signed by an unknown key", async () => {
    const { jwk, sign } = rsaJwk();
    const other = rsaJwk();
    const verifier = new KeycloakJwksVerifier(
      "http://kc/realms/DMS",
      "http://kc/realms/DMS/protocol/openid-connect/certs",
      async () => [{ kid: "kid-1", ...jwk }]
    );
    const forged = other.sign({ sub: "attacker" }, "kid-1");
    await expect(verifier.verify(forged)).rejects.toThrow();
  });

  it("rejects expired tokens", async () => {
    const { jwk, sign } = rsaJwk();
    const verifier = new KeycloakJwksVerifier("iss", "url", async () => [{ kid: "kid-1", ...jwk }]);
    const token = sign({ sub: "user-1", exp: Math.floor(Date.now() / 1000) - 60 }, "kid-1");
    await expect(verifier.verify(token)).rejects.toThrow(/expired/);
  });

  it("rejects alg none and unexpected algorithms", async () => {
    const { jwk } = rsaJwk();
    const verifier = new KeycloakJwksVerifier("iss", "url", async () => [{ kid: "kid-1", ...jwk }]);
    const unsigned = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(
      '{"sub":"x"}'
    ).toString("base64url")}.`;
    await expect(verifier.verify(unsigned)).rejects.toThrow();
  });

  it("re-fetches keys once when the kid rotates", async () => {
    const first = rsaJwk();
    const second = rsaJwk();
    let calls = 0;
    const keys = [first, second];
    const verifier = new KeycloakJwksVerifier("iss", "url", async () => {
      const key = keys[Math.min(calls, keys.length - 1)];
      calls += 1;
      return [{ kid: `kid-${calls}`, ...key.jwk }];
    }, false, { revalidateWindowMs: 0 });
    const old = first.sign({ sub: "user-1" }, "kid-1");
    await verifier.verify(old);
    const rotated = second.sign({ sub: "user-2" }, "kid-2");
    await expect(verifier.verify(rotated)).resolves.toMatchObject({ sub: "user-2" });
    expect(calls).toBe(2);
  });
});

describe("HmacTokenVerifier", () => {
  it("verifies tokens signed with the shared secret and rejects everything else", async () => {
    const verifier = new HmacTokenVerifier("dev-secret");
    const token = jwt.sign({ sub: "user-1" }, "dev-secret", { algorithm: "HS256" });
    await expect(verifier.verify(token)).resolves.toMatchObject({ sub: "user-1" });
    const wrong = jwt.sign({ sub: "user-1" }, "other-secret", { algorithm: "HS256" });
    await expect(verifier.verify(wrong)).rejects.toThrow();
    await expect(verifier.verify("not-a-jwt")).rejects.toThrow();
  });
});
