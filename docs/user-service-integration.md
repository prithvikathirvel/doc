# User Service / Keycloak integration — implemented design

This document describes how the DMS integrates the central **User Service**
(`https://apidev.sifymodernization.digital/user-mgt`, backed by Keycloak) as
shipped in this repository. It replaces the earlier planning checklist.

## Design in one paragraph

Keycloak decides **who** the user is; the DMS database decides **what** they may
do. The browser exchanges credentials once (`POST /api/auth/login`), receives
httpOnly cookies it can neither read nor forge, and every API request is
verified against the realm's published signing keys. Workspace membership and
roles live exclusively in the DMS (`tenant_members`), never in the token.
Machine clients that cannot hold a browser session authenticate with
DB-backed API keys (`x-api-key`); the legacy trusted-header mode keeps working
for existing integrations until they migrate.

---

## 1. Environment

| Variable | Meaning | Example |
| --- | --- | --- |
| `DMS_APP_ID` | `x-app-id` sent to the User Service | `DMS` |
| `USER_MGT_BASE_URL` | User Service base URL | `https://apidev.sifymodernization.digital/user-mgt` |
| `KEYCLOAK_BASE_URL` | Keycloak base URL — enables JWKS verification | `http://1.6.37.35/keycloak` |
| `KEYCLOAK_REALM` | Realm | `DMS` |
| `KEYCLOAK_CLIENT_ID` / `KEYCLOAK_CLIENT_SECRET` | DMS client, used to refresh tokens | `DMS` / *from app_auth_config* |
| `KEYCLOAK_STRICT_ISSUER` | reject foreign issuers (default lenient) | `false` |
| `DMS_PLATFORM_ADMINS` | bootstrap administrator emails | `ops@sifycorp.com` |
| `AUTH_DISABLED` | legacy trusted-header mode for API clients | `false` |

The realm entry for DMS in the User Service `app_auth_config` is the source for
the client credentials; mirror `clientId` / `clientSecret` into the DMS
environment (the secret is never stored in the DMS database).

## 2. Database (sql/migrations/2026_08_auth_rbac.sql)

| Table | Purpose |
| --- | --- |
| `dms_users` | One row per account, keyed by the User Service user id (JWT `sub`). Passwords are never stored. |
| `tenant_members` | Workspace membership + role (`tenant_admin` / `member`). |
| `dms_user_aliases` | Legacy `x-user-id` values claimed by an account (global: email, username, id; or tenant-scoped). |
| `dms_api_keys` | SHA-256 hashes of machine-client keys, with scope and roles. |

## 3. Endpoints

| Endpoint | Notes |
| --- | --- |
| `POST /api/auth/login` | Proxies the User Service login (`x-app-id: DMS`), verifies the returned token, upserts `dms_users`, sets `dms_at` / `dms_rt` httpOnly cookies, returns the session (user, platform flag, memberships). Rate limited. |
| `POST /api/auth/signup` | User Service signup; account exists but has no workspace yet. |
| `GET /api/auth/session` | Session for the cookie; `401 TOKEN_EXPIRED` tells the client to refresh. |
| `POST /api/auth/refresh` | Refreshes via Keycloak's token endpoint using the DMS client credentials. |
| `POST /api/auth/logout` | Revokes the refresh token at Keycloak, clears cookies. |
| `POST /api/users` | Admin: create an account (signup + one immediate login to learn the user id) and optionally attach it to a workspace. |
| `GET/POST/PATCH/DELETE /api/tenants/{id}/members[...]` | Workspace membership directory. |
| `GET/POST/PATCH/DELETE /api/api-keys[...]` | Machine-client keys (platform admins). The full key is returned exactly once. |

## 4. Request authentication order

`src/auth/resolver.ts` tries, in order:

1. **`x-api-key`** → hash lookup in `dms_api_keys` (active, unexpired). The key
   fixes the workspace scope; roles come from the key.
2. **`dms_at` cookie / `idtoken` / `Authorization: Bearer`** → signature verified
   against the realm JWKS (cached; re-fetched on key rotation; never merely
   decoded). The subject is looked up in `dms_users`; roles and tenant come from
   `tenant_members`. `x-tenant-id` selects a workspace for multi-workspace
   users and is validated against membership; platform administrators may omit
   it on platform endpoints.
3. **Trusted headers** (only when `AUTH_DISABLED=true`): the previous behaviour,
   unchanged, for existing machine clients. Keep it behind a gateway.

Cookie-authenticated mutations additionally require the `x-dms-client: web`
header (CSRF defence; the web app always sends it), and the cookies are
`SameSite=Lax`.

## 5. Redirects (web UI)

One credential set for everyone. After `POST /api/auth/login`:

| Session | Lands on |
| --- | --- |
| `isPlatformAdmin` | `/admin` |
| one workspace | `/workspace` |
| several workspaces | `/select-workspace` (picker) |
| no workspace yet | `/pending` |

Landing on the "wrong" login page simply redirects to the right home.

## 6. Claiming legacy activity

When a machine client uploads with a raw `x-user-id` (email, employee code…)
and that person later signs up and is attached to the workspace,
`POST /api/tenants/{id}/members` (or admin account creation) re-points
`documents`, `document_versions`, `folders` and user `document_permissions`
rows from every known alias to the canonical user id — in one transaction.
Aliases are seeded automatically (id, email, username); extra ids can be passed
as `claimAliases`. The member then sees those documents in the normal member
view immediately.

## 7. What is deliberately NOT used

The User Service RBAC APIs (`/feature`, `/role`, `/user-app-roles`). Roles are
owned by the DMS (`tenant_members` + `dms_users.is_platform_admin`), per the
integration decision: Keycloak is the authenticator for the UI only, and
authorization stays inside the DMS.

## 8. Preview / local development

```bash
npx ts-node --transpile-only scripts/dev-preview-api.ts   # API on :3001
cd web && DMS_API_URL=http://127.0.0.1:3001 npm run dev   # UI on :3000
```

The preview API uses a local `DevIdentityProvider` (HMAC tokens signed with
`JWT_SECRET`) wired through the same `AuthService`/`AuthResolver` code paths.

Preview accounts (password `preview`): `admin@platform.io` (platform admin),
`jane@acme.com` (Acme administrator), `carlos@acme.com`, `priya@acme.com`
(Acme members), `sam@northwind.io` (Northwind administrator).
