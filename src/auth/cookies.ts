import { Request, Response } from "express";
import { settings } from "../config/settings";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "./authService";
import { TokenBundle } from "./models";

/** Minimal cookie reader; avoids adding a cookie-parser dependency. */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return undefined;
}

function secureCookies(req: Request): boolean {
  const configured = settings.auth.cookieSecure;
  if (configured === "true") return true;
  if (configured === "false") return false;
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http");
  return proto.toLowerCase() === "https";
}

/**
 * Stores the session tokens in httpOnly cookies. The browser can neither read
 * them nor attach them to a cross-site request (SameSite=Lax), which is what
 * keeps the UI path XSS- and CSRF-hardened.
 */
export function setAuthCookies(req: Request, res: Response, tokens: TokenBundle): void {
  const secure = secureCookies(req);
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: Math.max(tokens.expiresIn, 60) * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: settings.auth.refreshCookieMaxAgeSeconds * 1000,
  });
}

export function clearAuthCookies(req: Request, res: Response): void {
  const secure = secureCookies(req);
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE]) {
    res.cookie(name, "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });
  }
}
