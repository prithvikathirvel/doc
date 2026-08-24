/**
 * Single source of truth for the deployment prefix.
 *
 * Mirrors `basePath` in next.config.ts — both read NEXT_PUBLIC_BASE_PATH.
 * Empty for a root deployment (local dev), e.g. "/dms" when the app is served
 * under /dms. Every same-origin API call and every user-facing URL we render
 * is prefixed with this so it resolves correctly behind a basePath.
 *
 *   dev:  unset  -> BASE_PATH = ""        -> "/api/auth/login"
 *   prod: "/dms" -> BASE_PATH = "/dms"    -> "/dms/api/auth/login"
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
