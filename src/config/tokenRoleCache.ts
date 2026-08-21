const entries = new Map<string, { roles: string[]; expiresAt: number }>();

/**
 * Login responses from the User Service may contain application roles that the
 * Keycloak access token does not yet expose as realm roles. Keep that verified
 * login result available for the lifetime of that exact token; this is not a
 * token-validation shortcut and is never populated before JWKS verification.
 */
export function cacheTokenRoles(token: string, roles: string[], expiresAt: number): void {
  prune();
  entries.set(token, { roles: [...roles], expiresAt });
}

export function cachedTokenRoles(token: string): string[] | undefined {
  const entry = entries.get(token);
  if (!entry || entry.expiresAt <= Math.floor(Date.now() / 1000)) {
    entries.delete(token);
    return undefined;
  }
  return [...entry.roles];
}

function prune(): void {
  const now = Math.floor(Date.now() / 1000);
  for (const [token, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(token);
  }
}
