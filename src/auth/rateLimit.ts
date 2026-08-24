import { settings } from "../config/settings";
import { UnauthorizedError } from "../utils/errors";

interface Window {
  hits: number[];
}

/**
 * Small in-process sliding-window limiter for the login endpoint. It slows
 * credential-stuffing down; a cluster-wide store (Redis) can replace it later
 * without touching callers.
 */
export class LoginRateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly max = settings.auth.loginRateLimit.max,
    private readonly windowMs = settings.auth.loginRateLimit.windowSeconds * 1000
  ) {}

  check(key: string): void {
    const now = Date.now();
    const window = this.windows.get(key) || { hits: [] };
    window.hits = window.hits.filter((hit) => now - hit < this.windowMs);
    if (window.hits.length >= this.max) {
      throw new UnauthorizedError(
        "Too many sign-in attempts. Try again in a few minutes."
      ).withCode("RATE_LIMITED");
    }
    window.hits.push(now);
    this.windows.set(key, window);

    if (this.windows.size > 10_000) {
      // Opportunistic cleanup so the map cannot grow without bound.
      for (const [entryKey, entry] of this.windows) {
        if (entry.hits.every((hit) => now - hit >= this.windowMs)) {
          this.windows.delete(entryKey);
        }
      }
    }
  }
}
