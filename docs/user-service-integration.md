# Integrating the Sify User Management Service with DMS

This document lists everything that must be created or changed in this DMS
project so that authentication, user management and RBAC are handled by the
external **User Service** (`https://apidev.sifymodernization.digital/user-mgt`)
backed by Keycloak, instead of the current header/dev-token login.

It is written as an implementation checklist with request/response examples.
Items marked **[BLOCKER]** must exist before any real user can sign in; the rest
can be phased.

---

## 0. Current DMS auth model (what we are replacing)

Today the DMS backend (`src/middleware/authorization.ts`) accepts identity in
one of two ways:

| Mode | Identity source | Roles source |
| --- | --- | --- |
| `AUTH_MODE=headers` (dev) | Headers `x-user-id`, `x-user-name`, `x-tenant-id` | Header `x-roles` |
| `AUTH_MODE=keycloak` | Cryptographically verified RS256 JWT in `Authorization: Bearer` | Keycloak `realm_access.roles`, client roles and User Service role names |

`AUTH_DISABLED=true` remains a backwards-compatible alias for
`AUTH_MODE=headers`; it is not a token-verification mode.

The frontend (`web/lib/session.ts`, `web/contexts/SessionContext.tsx`) stores
whatever the user typed on the login screen in `localStorage` and sends those
headers on every API call. There is no password check, no token refresh and no
central user directory.

The User Service changes all three of these:

1. Passwords are verified by Keycloak.
2. The frontend receives a real `accessToken` / `refreshToken`.
3. Role/feature information is owned by the User Service and keyed by `appId`.

---

## 1. One-time setup on the User Service side

These are not code changes in DMS. They are prerequisites that the DMS team
needs from the platform/identity team.

### 1.1 Create the Keycloak realm and client

Follow the platform's "App Onboarding Steps":

1. Log in to the Keycloak admin console and create a realm, e.g. `dms`.
2. Create a **confidential** client, e.g. `dms-web`, with:
   - Valid redirect URIs: `http://localhost:3000/*`, production origin.
   - Web origins: same as redirect URIs (for CORS).
   - Client protocol `openid-connect`.
3. Note the `clientId` and `clientSecret`.

### 1.2 Register the DMS application (`app-auth-config`)

This entry maps DMS to its Keycloak realm/client. It is required so the User
Service knows which realm tokens belong to DMS.

```http
POST https://apidev.sifymodernization.digital/user-mgt/api/app-auth-config
Content-Type: application/json
```

```json
{
  "appId": "DMS",
  "appName": "Document Management System",
  "appUrl": "http://localhost:3000",
  "provider": "keycloak",
  "clientId": "dms-web",
  "clientSecret": "Oitb***************************",
  "config": {
    "baseUrl": "http://1.6.37.35/keycloak",
    "realm": "dms",
    "adminUsername": "admin",
    "adminPassword": "admin"
  },
  "isActive": true
}
```

Response:

```json
{ "message": "Application config created successfully for Document Management System with appId: DMS" }
```

> `appId` = `DMS` is the value every DMS request must send in the `x-app-id`
> header. It is also the `appId` used when seeding features and roles.

---

## 2. Environment variables that must be added

### 2.1 DMS backend (`src/config/settings.ts` + `.env.example`)

```bash
# User Management Service
USER_MGT_BASE_URL=https://apidev.sifymodernization.digital/user-mgt
DMS_APP_ID=DMS
DMS_APP_CLIENT_ID=dms-web
DMS_APP_CLIENT_SECRET=Oitb***************************
DMS_WEB_ORIGIN=http://localhost:3000
CORS_ALLOWED_ORIGINS=http://localhost:3000
# Set to /dms/api when Nginx publishes the API below the /dms prefix.
PUBLIC_API_PATH=/api

# Keycloak token validation
KEYCLOAK_BASE_URL=http://1.6.37.35/keycloak
KEYCLOAK_REALM=dms
# Comma-separated. Used as fallback if the JWKS discovery fails.
KEYCLOAK_JWKS_URI=http://1.6.37.35/keycloak/realms/dms/protocol/openid-connect/certs
KEYCLOAK_ISSUER=http://1.6.37.35/keycloak/realms/dms
# Allow clock skew in seconds when verifying exp/iat.
KEYCLOAK_CLOCK_TOLERANCE=15
```

### 2.2 DMS frontend (`web/.env.example`)

```bash
# Public User Service URL used by the login and signup forms.
NEXT_PUBLIC_USER_MGT_BASE_URL=https://apidev.sifymodernization.digital/user-mgt
NEXT_PUBLIC_DMS_APP_ID=DMS
# Optional API origin if the UI host does not proxy POST /api requests.
NEXT_PUBLIC_DMS_API_BASE_URL=https://apidev.sifymodernization.digital/dms
# Optional browser-reachable Keycloak URLs for refresh/logout. If omitted,
# refresh/logout use the DMS server-side proxy.
NEXT_PUBLIC_KEYCLOAK_BASE_URL=
NEXT_PUBLIC_KEYCLOAK_TOKEN_URL=
NEXT_PUBLIC_KEYCLOAK_REALM=dms
NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=dms-web
```

---

## 3. Backend integration points

### 3.1 **[BLOCKER]** Verify Keycloak access tokens

`src/middleware/authorization.ts` must stop trusting a `jwt.decode()` and must
cryptographically verify the JWT against Keycloak's JWKS.

What to create:

- A new module `src/config/keycloak.ts` that:
  - Fetches `GET {KEYCLOAK_BASE_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/certs`.
  - Caches the signing keys (refresh on `kid` miss, max age 1 hour).
  - Exposes `verifyAccessToken(token): Promise<KeycloakClaims>`.
- Replace the body of `decodeToken()` in the auth middleware with a call to this
  verifier.
- Enforce:
  - `iss === KEYCLOAK_ISSUER`
  - `aud === DMS_APP_CLIENT_ID` (or verify the client in `azp`)
  - `exp` in the future
  - signature algorithm `RS256` (reject `none`)

Claims mapping:

```ts
interface KeycloakClaims {
  sub: string;            // userId
  email: string;
  preferred_username: string;
  given_name?: string;
  family_name?: string;
  realm_access?: { roles: string[] };
  tenant_id?: string;     // optional custom claim for the tenant
}
```

> Do **not** call the User Service on every request to validate the token — that
> defeats the purpose of a JWT and creates a hard runtime dependency. Use JWKS
> verification. Only call the User Service when you need data that is not in the
> token (assigned role details, feature list).

### 3.2 **[BLOCKER]** Require the `x-app-id` header

All User Service calls require `x-app-id`. DMS must also validate this header so
that a token issued for another application cannot be replayed against DMS.

Add at the top of `authMiddleware` (after token verification):

```ts
const appId = req.header("x-app-id");
if (appId !== settings.dmsAppId) {
  return next(new ForbiddenError("Unknown or missing x-app-id"));
}
```

For the Next.js rewrite (`/api/:path* -> DMS_API_URL`), the frontend must send
`x-app-id: DMS` on every call. The browser cannot keep the client secret; only
the access token is public.

### 3.3 Map User Service roles to DMS roles

DMS today understands three roles:

- `platform_admin`
- `tenant_admin`
- `member`

The User Service manages arbitrary roles per app (with feature/action pairs).
The mapping must be defined and seeded.

**Recommended mapping for the `DMS` app:**

| User Service role (roleName) | DMS role | Notes |
| --- | --- | --- |
| `Platform Admin` | `platform_admin` | Can onboard tenants, cross-tenant |
| `Tenant Admin` | `tenant_admin` | Full control inside one tenant |
| `Member` | `member` | Per-document grants only |

Implementation options (pick one):

1. **Role-name convention** — `authMiddleware` maps a Keycloak role named
   exactly `Tenant Admin` (and similarly `Platform Admin`/`Member`) to the
   corresponding DMS role. DMS normalizes spaces, underscores and case; no
   extra DB calls.
2. **User Service lookup** — on first request with a new token, call
   `GET /api/user-app-roles/{userId}/{appId}` and cache the result for the
   lifetime of the token. More flexible, but adds a network hop.

Start with option 1 and configure the Keycloak role mapper so the assigned
application role is present in the access token. Fall back to option 2 only if
the product team needs custom roles per tenant.

### 3.4 Seed DMS features in the User Service

The User Service models permissions as `feature + actions`. Seed the following
features for `appId: DMS` so the role builder in the central console can assign
them:

```http
POST https://apidev.sifymodernization.digital/user-mgt/api/feature/
x-app-id: DMS
Content-Type: application/json
```

```json
{
  "appId": "DMS",
  "feature": "Documents",
  "actions": [
    { "key": "DOCUMENT_READ",   "value": "View and download documents" },
    { "key": "DOCUMENT_WRITE",  "value": "Upload, rename and add versions" },
    { "key": "DOCUMENT_DELETE", "value": "Move to trash and restore" },
    { "key": "DOCUMENT_ADMIN",  "value": "Share and manage permissions" }
  ]
}
```

```json
{
  "appId": "DMS",
  "feature": "Tenants",
  "actions": [
    { "key": "TENANT_CREATE",  "value": "Onboard tenants" },
    { "key": "TENANT_READ",    "value": "View tenants" },
    { "key": "TENANT_UPDATE",  "value": "Edit tenant settings and storage" }
  ]
}
```

```json
{
  "appId": "DMS",
  "feature": "Users",
  "actions": [
    { "key": "USER_READ",   "value": "View workspace users" },
    { "key": "USER_ROLE",   "value": "Assign workspace roles" }
  ]
}
```

> These features are consumed by the central user-management UI. Inside DMS,
> document-level access is still controlled by the existing
> `document_permissions` table — the User Service features only decide the
> coarse role (admin vs member), not per-file shares.

### 3.5 Seed the three DMS roles in the User Service

Create the roles once (via the central console or the role API):

```http
POST https://apidev.sifymodernization.digital/user-mgt/api/role/
x-app-id: DMS
```

```json
{
  "roleName": "Tenant Admin",
  "appId": "DMS",
  "description": "Full control over one tenant's documents, users and settings",
  "permission": {
    "appId": "DMS",
    "privilege": [
      { "feature": "Documents", "actions": ["DOCUMENT_READ", "DOCUMENT_WRITE", "DOCUMENT_DELETE", "DOCUMENT_ADMIN"] },
      { "feature": "Users",     "actions": ["USER_READ", "USER_ROLE"] }
    ]
  },
  "template": "High Privileges"
}
```

Create the other two roles with the same endpoint and the exact role names below. Do **not** add a `DMS` prefix to `roleName`; `appId: DMS` already scopes them.

```http
POST https://apidev.sifymodernization.digital/user-mgt/api/role/
x-app-id: DMS
Content-Type: application/json
Authorization: Bearer <service-account-token>
```

```json
{
  "roleName": "Platform Admin",
  "appId": "DMS",
  "description": "Onboard tenants and administer every DMS workspace",
  "permission": {
    "appId": "DMS",
    "privilege": [
      { "feature": "Documents", "actions": ["DOCUMENT_READ", "DOCUMENT_WRITE", "DOCUMENT_DELETE", "DOCUMENT_ADMIN"] },
      { "feature": "Tenants", "actions": ["TENANT_CREATE", "TENANT_READ", "TENANT_UPDATE"] },
      { "feature": "Users", "actions": ["USER_READ", "USER_ROLE"] }
    ]
  },
  "template": "High Privileges"
}
```

```json
{
  "roleName": "Member",
  "appId": "DMS",
  "description": "Read documents granted by DMS document permissions",
  "permission": {
    "appId": "DMS",
    "privilege": [
      { "feature": "Documents", "actions": ["DOCUMENT_READ"] }
    ]
  },
  "template": "Low Privileges"
}
```

Save the returned role IDs. DMS uses those IDs when it calls
`POST /api/user-app-roles` and `PUT /api/user-app-roles/{userId}/DMS`.

### 3.6 Backend client for the User Service

Create `src/clients/userManagementClient.ts` wrapping the calls DMS needs at
runtime (not on every request).

```ts
export interface UserMgtUser {
  userId: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  isActive?: boolean;
}

export class UserManagementClient {
  constructor(private baseUrl: string, private appId: string) {}

  // Used by the admin "invite user" / "find user to share with" dialogs.
  async getUser(userId: string): Promise<UserMgtUser> { /* GET /api/user/{userId} */ }

  async findByEmail(email: string): Promise<UserMgtUser | null> { /* GET /api/user?email= */ }

  async listUsersForApp(): Promise<UserMgtUser[]> { /* GET /api/role/{appId} returns users+roles */ }

  async assignRole(userId: string, roleId: string): Promise<void> {
    // POST /api/user-app-roles
  }
}
```

All requests must include:

```http
x-app-id: DMS
Authorization: Bearer <service-account-token>
```

The service account token should be obtained once using client credentials
(Keycloak token endpoint with `grant_type=client_credentials`, using
`DMS_APP_CLIENT_ID` / `DMS_APP_CLIENT_SECRET`) and cached until shortly before
expiry. **Do not put the client secret in the frontend.**

---

## 4. Frontend integration points

### 4.1 **[BLOCKER]** Replace the mock login pages

Files to change:

- `web/app/login/page.tsx`
- `web/app/admin/login/page.tsx`
- `web/contexts/SessionContext.tsx`
- `web/lib/session.ts`
- `web/lib/api.ts`

The tenant login form must call the configured public User Service endpoint
instead of `/api/workspaces/resolve` or `/api/auth/login`:

```http
POST https://apidev.sifymodernization.digital/user-mgt/api/user/login
x-app-id: DMS
Content-Type: application/json
```

```json
{
  "email": "appmodern@gmail.com",
  "password": "appmodern"
}
```

The response includes `accessToken`, `refreshToken`, user details and
application information. Store only what the UI needs in `localStorage`
(access token, refresh token expiry, user profile, roles). Never store the
client secret.

Tenant resolution must move to a step **after** login:

1. User logs in → receives JWT.
2. DMS calls an endpoint (existing `/tenants/me`, or a new
   `GET /tenants/mine`) to determine which tenant this user belongs to from the
   `sub` / `email`.
3. If the user belongs to multiple tenants, show a tenant picker.

The current login screen field "Tenant ID / Workspace ID" is removed for
Keycloak users; the tenant is derived from the authenticated identity. Keep the
field only for the dev/header-auth fallback.

### 4.2 Send the correct headers on every API call

`web/lib/api.ts` → `sessionHeaders()` must change from:

```ts
headers["x-user-id"] = active.userId;
headers["x-user-name"] = active.userName;
headers["x-roles"] = active.roles.join(",");
```

to:

```ts
headers["x-app-id"] = process.env.NEXT_PUBLIC_DMS_APP_ID!;
headers["authorization"] = `Bearer ${active.accessToken}`;
if (active.tenantId) headers["x-tenant-id"] = active.tenantId;
```

The legacy `x-user-id` / `x-roles` headers should be removed once JWKS
verification is live.

### 4.3 Token refresh

Access tokens from Keycloak are short-lived (typically 5 minutes). Before every
API call, check `expiresAt`; if within 60 seconds of expiry, call:

```http
POST {KEYCLOAK_BASE_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
client_id=dms-web
refresh_token=<stored refresh token>
```

The UI uses the browser-reachable Keycloak token endpoint when
`NEXT_PUBLIC_KEYCLOAK_TOKEN_URL` is configured. If it is not configured, it
uses DMS `POST /api/auth/refresh`, which keeps the client secret server-side.
If the refresh call returns 400/401, clear the session and redirect to
`/login`. Implement this once in `web/lib/api.ts` so every call benefits.

### 4.4 Sign-up

The User Service exposes a sign-up endpoint that DMS links to
("Create an account" on `/login`):

```http
POST https://apidev.sifymodernization.digital/user-mgt/api/user/
x-app-id: DMS
Content-Type: application/json
```

```json
{
  "email": "appmodern@gmail.com",
  "password": "appmodern",
  "username": "appmodern",
  "firstName": "app",
  "lastName": "modern",
  "phone": "+919876543210",
  "gender": "Male",
  "address": "No 1. ABC Street",
  "additionalDetails": { "department": "developer" }
}
```

Required: `email`, `password`, `username`. On success, either auto-login or show
"Account created — please sign in".

### 4.5 Logout

Call the browser-reachable Keycloak end-session endpoint with the id-token hint,
then clear DMS localStorage:

```http
GET {KEYCLOAK_BASE_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/logout?post_logout_redirect_uri=http://localhost:3000/login&id_token_hint=<id_token>
```

Update `SessionContext.signOut()` to do this instead of only clearing local
state.

---

## 5. RBAC wiring inside DMS

### 5.1 What the User Service controls

- Authentication (password + OIDC).
- App-level roles (`Platform Admin`, `Tenant Admin`, `Member`).
- Which users are attached to the DMS app.
- Feature/action catalog used by the central role builder.

### 5.2 What DMS keeps controlling

- Tenant membership (which user is in which tenant).
- Per-document permissions (`viewer`, `contributor`, `manager`, `owner`).
- Storage configuration, folders, versions.

This split must be documented in the UI: a central role grants "you are an
admin of DMS", but tenant membership and file shares are still granted inside
DMS.

### 5.3 Assigning a DMS role to a user

When an administrator invites a user to a tenant in the DMS UI, DMS must:

1. Look up the user in the User Service (by email or list).
2. Call:

```http
POST https://apidev.sifymodernization.digital/user-mgt/api/user-app-roles
x-app-id: DMS
```

```json
{
  "appId": "DMS",
  "userId": "c3417cf5-5ca2-4736-bdf6-9b37a2fa0e63",
  "roleId": "2c62479e-f886-409b-8e26-a786fb4f482e"
}
```

3. Store the tenant membership in DMS (`tenant_members` table — see §6).

If the user later changes role:

```http
PUT https://apidev.sifymodernization.digital/user-mgt/api/user-app-roles/{userId}/DMS
x-app-id: DMS
```

```json
{ "roleId": "new-role-id" }
```

### 5.4 Showing assigned users in the admin/people screens

The existing People screens (`/workspace/users`, `/admin/tenants/{id}/users`)
currently derive users from the audit/analytics tables. They should be enriched
with:

```http
GET https://apidev.sifymodernization.digital/user-mgt/api/role/DMS
x-app-id: DMS
```

This returns all users who have a DMS role, along with the role. Join on `userId`
with DMS's tenant membership table.

---

## 6. Database changes required in DMS

The current schema has no table that ties a Keycloak `userId` to a DMS tenant.
One is needed because Keycloak is identity-only — it does not know that
`user-123` belongs to tenant `tenant-456`.

Add via a SQL migration (mirroring the existing files in `sql/`):

```sql
CREATE TABLE tenant_members (
  id              CHAR(36) PRIMARY KEY,
  tenant_id       CHAR(36) NOT NULL,
  user_id         VARCHAR(128) NOT NULL,       -- Keycloak "sub"
  email           VARCHAR(320),
  role            ENUM('tenant_admin','member') NOT NULL DEFAULT 'member',
  status          ENUM('active','suspended') NOT NULL DEFAULT 'active',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tenant_user (tenant_id, user_id),
  KEY idx_user_id (user_id)
);
```

A platform admin does not need a row here; their role is detected from the JWT.

> This table is also where a future "invite user" flow writes before calling the
> User Service to assign a role.

---

## 7. New/changed backend endpoints in DMS

These endpoints belong **in DMS** (not the User Service). They are kept for
server-side workflows and deployments that cannot expose the identity provider
to the browser. In the current UI, the public login and signup forms call the
configured User Service URLs directly; protected User Service operations such
as user lookup and role assignment still go through DMS server-to-server.

### 7.1 `POST /api/auth/login`

Request:

```json
{ "email": "appmodern@gmail.com", "password": "appmodern" }
```

Behavior:

1. Proxy to User Service `POST /api/user/login` with `x-app-id: DMS`.
2. On success, verify the returned access token (defense in depth).
3. Look up `tenant_members` for the user; return tenants and the DMS-resolved
   role.

Response:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "expiresIn": 300,
  "user": {
    "userId": "c3417cf5-...",
    "email": "appmodern@gmail.com",
    "displayName": "app modern"
  },
  "role": "tenant_admin",
  "tenants": [
    { "id": "tenant-456", "name": "Acme", "slug": "acme" }
  ]
}
```

### 7.2 `POST /api/auth/refresh`

Request: `{ "refreshToken": "..." }`. Proxies the Keycloak token endpoint using
the DMS client secret. Returns new tokens.

### 7.3 `POST /api/auth/logout`

Invalidates the refresh token in Keycloak.

### 7.4 `POST /api/auth/signup`

Proxies `POST /api/user/` for self sign-up.

### 7.5 `GET /api/tenants/mine`

Returns the tenants the authenticated user belongs to (from `tenant_members`),
plus platform-admin tenants if the user has that role. Used by the frontend to
decide where to send the user after login.

### 7.6 Changes to existing endpoints

- `GET /api/tenants/me` currently uses `x-tenant-id`; it must also work without
  that header once a user is authenticated, selecting their single membership or
  returning 409 if they have more than one.
- Every existing route must keep working; the only change is that `req.auth` is
  populated from a verified JWT instead of developer headers.

---

## 8. Configuration / feature flags

Add these toggles so the migration can be staged:

```bash
# "headers" = current dev mode, "keycloak" = User Service integration
AUTH_MODE=keycloak
# When true, the legacy x-user-id/x-roles headers are still accepted (dev only).
AUTH_ALLOW_DEV_HEADERS=false
# When true, new sign-ups are allowed on /login.
ALLOW_PUBLIC_SIGNUP=true
```

Recommended rollout:

1. Deploy with `AUTH_MODE=headers` unchanged, add all the new code behind the
   flag.
2. Set `AUTH_MODE=keycloak` on staging and run through login + sharing.
3. Turn off `AUTH_ALLOW_DEV_HEADERS` in production once verified.

---

## 9. End-to-end integration example

A new tenant user "Priya" signs in and opens a document:

1. Priya opens `https://dms.example.com/login`.
2. She enters `priya@acme.com` + password.
3. Browser calls User Service `POST /user-mgt/api/user/login` with
   `x-app-id: DMS`.
4. Keycloak validates credentials and returns `accessToken`, `refreshToken`.
5. Browser calls DMS `GET /api/tenants/mine` with the bearer token.
6. DMS verifies the JWT via JWKS, reads `sub`, `email`,
   `realm_access.roles` and looks up `tenant_members`.
7. DMS returns Priya's tenant list; Priya is in tenant `acme` with role `member`.
9. Browser stores tokens in `localStorage` and redirects to `/workspace`.
10. Every subsequent DMS API call includes:
    ```http
    Authorization: Bearer <accessToken>
    x-app-id: DMS
    x-tenant-id: acme
    ```
11. DMS middleware verifies the JWT signature/expiry on each call — no User
    Service network hop.
12. When Priya opens a document, DMS also checks `document_permissions` for
    per-file access on top of her coarse `member` role.
13. When the access token is about to expire, the browser refreshes it through
    the configured Keycloak token endpoint (or the DMS refresh proxy).

---

## 10. Security checklist

- [ ] JWT signature verified against Keycloak JWKS, never `jwt.decode()` alone.
- [ ] Issuer, audience and expiry are enforced.
- [ ] `x-app-id` is required and matches `DMS`.
- [ ] Client secret is only used server-side; never exposed to the browser.
- [ ] Refresh token is stored according to the team's security policy
      (`localStorage` is acceptable for an internal app; for higher assurance
      use an `httpOnly` cookie set by DMS).
- [ ] CORS on the User Service allows only the DMS origin.
- [ ] The Keycloak redirect URI allowlist contains exact DMS origins, no
      wildcards.
- [ ] Document-level permissions in DMS are still enforced — central roles do
      not bypass them.
- [ ] Audit log records `userId` from the verified `sub` claim, not a
      client-supplied header.
- [ ] Failed token refresh clears the session and returns 401 consistently.

---

## 11. Acceptance criteria / definition of done

- [ ] A user created through the User Service can sign in to DMS.
- [ ] An invalid password is rejected by Keycloak and shown as an error in DMS.
- [ ] An expired access token is transparently refreshed; a failed refresh logs
      the user out.
- [ ] `platform_admin`, `tenant_admin` and `member` each land on the correct
      screen and see only what their role permits.
- [ ] The People page lists users from the User Service joined with tenant
      membership.
- [ ] Assigning a role in DMS calls `POST /api/user-app-roles`.
- [ ] No DMS endpoint trusts `x-user-id` / `x-roles` when `AUTH_MODE=keycloak`.
- [ ] All existing document, folder and storage tests still pass.
- [ ] New integration tests cover: valid token, expired token, wrong `x-app-id`,
      user with no tenant membership, multi-tenant user.

---

## 12. Suggested implementation order

1. Add settings, env vars, Keycloak JWKS verifier and `x-app-id` check
   (§2, §3.1, §3.2).
2. Create `tenant_members` table and the `/tenants/mine` endpoint (§6, §7.5).
3. Add `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout` (§7.1–7.3).
4. Rewrite the frontend login/session/API layers to use tokens (§4.1–4.3, §4.5).
5. Seed features and the three DMS roles in the User Service (§3.4, §3.5).
6. Add the User Management client and the "assign role" UI (§3.6, §5.3).
7. Enrich the People page with users from the User Service (§5.4).
8. Add optional self sign-up (§4.4).
9. Flip `AUTH_MODE=keycloak` on staging, then production (§8).

---

## 13. Open questions to confirm with the platform team

1. What is the exact shape of the login response? The brief says "AccessToken,
   refreshToken, user details and application information" — field names are
   needed (`accessToken` vs `access_token`, etc.).
2. Is there a userinfo endpoint (`/protocol/openid-connect/userinfo`) we should
   call, or are all claims in the token?
3. Which claim carries tenant information — a custom `tenant_id` claim, or do we
   always look up `tenant_members`?
4. Is there an endpoint to list/search users by email for the share dialog, or
   only `GET /api/role/{appId}`?
5. What are the password policy, lockout and MFA settings for the `dms` realm?
6. What is the access-token and refresh-token TTL for the `dms` client?
7. Do we need to host the login page inside DMS, or redirect to Keycloak?
8. Is a client-credentials service account available for DMS-to-User-Service
   calls, or should DMS use a platform admin's personal token?
