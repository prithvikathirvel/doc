import { settings } from "../config/settings";
import { UserManagementError } from "./userManagementClient";

export interface KeycloakTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  refreshExpiresIn?: number;
  idToken?: string;
}

export async function refreshKeycloakToken(refreshToken: string): Promise<KeycloakTokenResponse> {
  if (!settings.dmsAppClientSecret) {
    throw new UserManagementError(500, "DMS client credentials are not configured");
  }
  const raw = await tokenRequest({
    grant_type: "refresh_token",
    client_id: settings.dmsAppClientId,
    client_secret: settings.dmsAppClientSecret,
    refresh_token: refreshToken,
  });
  return normalizeTokenResponse(raw);
}

/** Invalidates the refresh token server-side. Logout is intentionally idempotent. */
export async function logoutKeycloakSession(
  refreshToken: string,
  idToken?: string,
  postLogoutRedirectUri = `${settings.dmsWebOrigin}/login`
): Promise<void> {
  if (!settings.dmsAppClientSecret) return;
  const endpoint = `${settings.keycloak.baseUrl}/realms/${encodeURIComponent(settings.keycloak.realm)}/protocol/openid-connect/logout`;
  const form = new URLSearchParams({
    client_id: settings.dmsAppClientId,
    client_secret: settings.dmsAppClientSecret,
    refresh_token: refreshToken,
  });
  try {
    // The POST revokes the refresh token for confidential clients.
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!idToken) return;

    // Also perform the OIDC end-session call when the User Service returned an
    // id_token. This covers Keycloak installations that use browser logout.
    const url = new URL(endpoint);
    url.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);
    url.searchParams.set("id_token_hint", idToken);
    await fetch(url.toString(), { method: "GET" });
  } catch {
    // Logout must remain safe to repeat even if the identity provider is down.
  }
}

async function tokenRequest(form: Record<string, string>): Promise<unknown> {
  const endpoint = `${settings.keycloak.baseUrl}/realms/${encodeURIComponent(settings.keycloak.realm)}/protocol/openid-connect/token`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const text = await response.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    throw new UserManagementError(response.status, "Keycloak rejected the token request", body);
  }
  return body;
}

function normalizeTokenResponse(raw: unknown): KeycloakTokenResponse {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const accessToken = stringValue(source.access_token, source.accessToken);
  const refreshToken = stringValue(source.refresh_token, source.refreshToken);
  if (!accessToken || !refreshToken) {
    throw new UserManagementError(502, "Keycloak returned no refreshed tokens", raw);
  }
  return {
    accessToken,
    refreshToken,
    expiresIn: numberValue(source.expires_in, source.expiresIn),
    refreshExpiresIn: numberValue(source.refresh_expires_in, source.refreshExpiresIn),
    idToken: stringValue(source.id_token, source.idToken),
  };
}

function stringValue(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

function numberValue(...values: unknown[]): number | undefined {
  return values.find((value): value is number => typeof value === "number" && Number.isFinite(value));
}
