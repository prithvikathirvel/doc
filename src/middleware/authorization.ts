import { NextFunction, Request, Response } from "express";
import { AuthContext } from "../service/models";
import { UnauthorizedError } from "../utils/errors";
import { CLIENT_HEADER } from "../auth/authService";
import { container } from "../config/container";

declare global {
  namespace Express {
    interface Request {
      auth: AuthContext;
    }
  }
}

/**
 * Resolves the caller's identity (see AuthResolver) and enforces the CSRF
 * defence for cookie-authenticated browser sessions: state-changing requests
 * must carry the x-dms-client header the web app always sends. That header
 * cannot be attached cross-site without passing a CORS preflight, and the
 * session cookies are SameSite=Lax on top.
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  container.authResolver
    .resolve(req)
    .then((auth) => {
      if (
        auth.scheme === "ui_session" &&
        !["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase()) &&
        req.header(CLIENT_HEADER) !== "web"
      ) {
        throw new UnauthorizedError("Missing client header").withCode("CSRF_REJECTED");
      }
      req.auth = auth;
      next();
    })
    .catch((error) => next(error));
}
