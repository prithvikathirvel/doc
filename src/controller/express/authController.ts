import { NextFunction, Request, Response } from "express";
import { container } from "../../config/container";
import { UnauthorizedError, ValidationError } from "../../utils/errors";
import { loginSchema, signupSchema } from "../../validator/authSchemas";
import { clearAuthCookies, readCookie, setAuthCookies } from "../../auth/cookies";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "../../auth/authService";
import { LoginRateLimiter } from "../../auth/rateLimit";

const rateLimiter = new LoginRateLimiter();

function validate<T>(
  schema: { validate: (value: unknown, options?: object) => { error?: { message: string }; value: T } },
  payload: unknown
): T {
  const { error, value } = schema.validate(payload, { abortEarly: true, stripUnknown: false });
  if (error) throw new ValidationError(error.message.replace(/"/g, ""));
  return value;
}

function clientKey(req: Request, email: string): string {
  const ip = String(
    req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown"
  ).split(",")[0].trim();
  return `${ip}:${email}`;
}

function assertAuthConfigured(): void {
  if (!container.authService.configured) {
    throw new UnauthorizedError(
      "Authentication is not configured on this deployment. Set USER_MGT_BASE_URL (and KEYCLOAK_BASE_URL), or AUTH_DISABLED=true with JWT_SECRET for the preview API."
    ).withCode("AUTH_NOT_CONFIGURED");
  }
}

/** POST /api/auth/login — exchanges credentials for an httpOnly cookie session. */
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertAuthConfigured();
    const payload = validate(loginSchema, req.body);
    const email = payload.email.trim().toLowerCase();
    rateLimiter.check(clientKey(req, email));

    const result = await container.authService.login(email, payload.password);
    setAuthCookies(req, res, result.tokens);
    res.json({ session: result.session });
  } catch (err) {
    next(err);
  }
}

/** POST /api/auth/signup — creates the account in the identity provider only. */
export async function signup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertAuthConfigured();
    const payload = validate(signupSchema, req.body);
    await container.authService.signup({
      email: payload.email,
      password: payload.password,
      username: payload.username || undefined,
      firstName: payload.firstName || undefined,
      lastName: payload.lastName || undefined,
      phone: payload.phone || undefined,
      gender: payload.gender || undefined,
      address: payload.address || undefined,
      additionalDetails: payload.additionalDetails,
    });
    res.status(201).json({
      message:
        "Account created. A workspace administrator can now add you to a workspace, then you can sign in.",
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/auth/refresh — public: authenticated by the refresh cookie itself. */
export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertAuthConfigured();
    const token = readCookie(req, REFRESH_COOKIE);
    if (!token) {
      clearAuthCookies(req, res);
      throw new UnauthorizedError("Session expired").withCode("TOKEN_EXPIRED");
    }
    try {
      const result = await container.authService.refresh(token);
      setAuthCookies(req, res, result.tokens);
      res.json({ session: result.session });
    } catch (error) {
      clearAuthCookies(req, res);
      throw error;
    }
  } catch (err) {
    next(err);
  }
}

/** POST /api/auth/logout — revokes the refresh token and clears cookies. */
export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = readCookie(req, REFRESH_COOKIE);
    if (container.authService.configured && token) {
      await container.authService.logout(token);
    }
    clearAuthCookies(req, res);
    res.json({ message: "Signed out" });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/session — public: authenticated by the access-token cookie.
 * Returns the full session (user, memberships, platform flag) so the browser
 * can route to the right home without ever seeing a token. Expired tokens
 * surface as 401 TOKEN_EXPIRED, which the web app answers with /auth/refresh.
 */
export async function session(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertAuthConfigured();
    const token = readCookie(req, ACCESS_COOKIE);
    if (!token) {
      throw new UnauthorizedError("Not signed in").withCode("AUTH_REQUIRED");
    }
    try {
      const { session: userSession } = await container.authService.sessionFromToken(token);
      res.json({ session: userSession });
    } catch (error) {
      if ((error as { code?: string }).code === "TOKEN_EXPIRED") {
        clearAuthCookies(req, res);
      }
      throw error;
    }
  } catch (err) {
    next(err);
  }
}
