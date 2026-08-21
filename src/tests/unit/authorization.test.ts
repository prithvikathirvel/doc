import { Request } from "express";
import { authMiddleware } from "../../middleware/authorization";
import { settings } from "../../config/settings";
import { verifyAccessToken } from "../../config/keycloak";

jest.mock("../../config/keycloak", () => ({
  verifyAccessToken: jest.fn(),
}));

const verify = verifyAccessToken as jest.MockedFunction<typeof verifyAccessToken>;
const originalMode = settings.authMode;
const originalDisabled = settings.authDisabled;
const originalAllowHeaders = settings.authAllowDevHeaders;

beforeEach(() => {
  settings.authMode = "keycloak";
  settings.authDisabled = false;
  settings.authAllowDevHeaders = false;
  verify.mockResolvedValue({
    sub: "user-1",
    email: "user@example.com",
    preferred_username: "user",
    realm_access: { roles: ["Member"] },
  });
});

afterAll(() => {
  settings.authMode = originalMode;
  settings.authDisabled = originalDisabled;
  settings.authAllowDevHeaders = originalAllowHeaders;
});

function request(headers: Record<string, string>): Request {
  return {
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

async function runMiddleware(req: Request) {
  const next = jest.fn();
  authMiddleware(req, {} as never, next);
  await new Promise((resolve) => setImmediate(resolve));
  return next;
}

test("requires the DMS app id after token verification", async () => {
  const next = await runMiddleware(
    request({ authorization: "Bearer signed-token", "x-app-id": "OTHER_APP" })
  );
  expect(verify).toHaveBeenCalledWith("signed-token");
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
});

test("attaches the verified identity without trusting user headers", async () => {
  const req = request({
    authorization: "Bearer signed-token",
    "x-app-id": "DMS",
    "x-user-id": "attacker",
  });
  const next = await runMiddleware(req);
  expect(next).toHaveBeenCalledWith();
  expect(req.auth.userId).toBe("user-1");
  expect(req.auth.roles).toEqual(["member"]);
});
