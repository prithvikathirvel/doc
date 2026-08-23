# Secure authorization with Keycloak (JWT = auth, roles resolved server-side)

This document explains how the DMS authenticates users with Keycloak and — more
importantly — how it **authorizes every API call by role, in a production-grade
and tamper-proof way**, even when the caller's JWT does not contain any role
information.

It is the authoritative reference for the design used by both the API
(`src/`) and the web app (`web/`). If you change role handling, update this file.

---

## TL;DR — the one principle

> **The access token proves *who you are* (authentication). Your *role* is
> resolved by the DMS backend itself, on every request, from stores DMS
> trusts. Roles are never read from the token.**

This single rule fixes every login/authorization bug in the old code and makes
the "tenant integrates with a different JWT" scenario secure **by construction**:
a tenant's service can forward *any* validly-signed Keycloak token and the DMS
will still authorize the call correctly, because the tenant never has to put
roles into that token.

---

## 1. The bugs that existed before this change

| # | Bug | Effect |
|---|-----|--------|
| 1 | **Role extraction missed the real payload shape.** The User Service returns the role at `data.user.role.roleName` and the app envelope at `data.app`. Both the backend (`extractResponseRoles`) and the frontend (`normalizeUserManagementLogin`) looked at `data.role` / `data.application` / top-level keys that **do not exist** in this payload. | **Every** login silently returned `member`, even for a Platform Admin. The admin console was unreachable. |
| 2 | **Authorization depended on a per-token, in-memory cache that was never populated.** The browser logs in *directly* against the User Service (`/api/user/login`), so the backend `/api/auth/login` controller — the only code that called `cacheTokenRoles(token, …)` — never ran. | On every protected request the middleware fell back to reading roles from the JWT. The Keycloak JWT carries only realm roles (`default-roles-dms`, `offline_access`, …), so **everyone was downgraded to `member`**. |
| 3 | **The cache was not horizontally scalable.** Even when `/api/auth/login` ran, the cache was keyed by the literal token string in a single process. | Behind a load balancer, or after a restart, a Platform Admin became `member` again. |
| 4 | **No authoritative source for `platform_admin`** on the protected path. | Platform-only endpoints (list/onboard tenants) could not be reliably protected. |
| 5 | **Audience check rejected tenant integrations.** The verifier required `azp == dms-web`. | A tenant service calling the DMS with its own valid Keycloak client token was rejected, even though the token was correctly signed and the subject was a known member. |

---

## 2. The unified role model (frontend + backend use the same contract)

There are exactly **three roles**. The display name comes from the User
Management Service; the stable id is what the code uses everywhere. Both the API
(`src/utils/roles.ts`) and the web app (`web/lib/session.ts`) map the display
name to the same id, so "Platform Admin" always means `platform_admin` on both
sides.

| Display name (User Service) | Stable role id | Can sign in at | Scope |
|---|---|---|---|
| **Platform Admin** | `platform_admin` | `/admin/login` | Whole platform: onboard and read any tenant; acts as a tenant administrator inside any tenant it targets. |
| **Tenant Admin** | `tenant_admin` | `/login` | One tenant: full control of that tenant's documents, folders, members and storage. (`admin` is accepted as a legacy alias.) |
| **Member** | `member` | `/login` | One tenant: access limited to documents they created or were granted. |

> **Onboarding flow:** a Platform Admin creates a tenant and registers the
> owner's email. That owner is the **Tenant Admin**. Everyone else added to the
> tenant is a **Member**. The tenant-scoped role is stored in DMS's own
> `tenant_members` table; the application-level role (incl. Platform Admin) is
> stored in the User Management Service.

This mapping is implemented in **one** place on each side:

- Backend: `mapUserServiceRoles()` in `src/utils/roles.ts`.
- Frontend: `normalizeDmsRole()` in `web/lib/api.ts` and the constants in
  `web/lib/session.ts`.

---

## 3. How a request is authenticated and authorized

```
                ┌──────────────────────────────────────────────────────────┐
   Browser or   │  Authorization: Bearer <Keycloak RS256 access token>      │
   tenant       │  x-app-id: DMS                                            │
   service  ──► │  x-tenant-id: <tenant uuid>   (selector, optional)        │
                └──────────────────────────────────────────────────────────┘
                                       │
                                       ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │ src/middleware/authorization.ts   (authMiddleware)                    │
   │                                                                       │
   │  1. AUTHENTICATION — verify the JWT                                   │
   │     • RS256 signature against the realm JWKS (cached, key-rotated)    │
   │     • issuer, expiry, iat-not-in-future (clock tolerance)             │
   │     • audience/azp must name an ALLOWED client                        │
   │     → yields the verified subject (sub). This is the ONLY identity     │
   │       fact taken from the token.                                      │
   │                                                                       │
   │  2. x-app-id must equal DMS                                           │
   │                                                                       │
   │  3. AUTHORIZATION — resolve the role, server-side                     │
   │     • app roles (incl. platform_admin): RoleResolver → User Mgt Svc   │
   │       GET /api/role/DMS  (cached per user, TTL = ROLE_CACHE_TTL_SEC)  │
   │     • if a tenant is selected and the user is NOT a platform admin:   │
   │         role = tenant_members row for (user, tenant)                  │
   │         (must be active, else 403)                                    │
   │                                                                       │
   │  4. req.auth = { userId, tenantId, roles[], authSource: "keycloak" }  │
   └───────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │ Controllers / services enforce the role:                              │
   │   • TenantService.assertPlatformAdmin()  → onboard/list tenants       │
   │   • TenantService.assertTenantAccess()   → tenant isolation           │
   │   • isTenantAdmin(roles)                 → analytics, members, …      │
   │   • DocumentService.requireDocument()    → per-document grant levels  │
   └───────────────────────────────────────────────────────────────────────┘
```

Key points:

- **The token's role claims are ignored for authorization.** Whether the JWT
  contains `realm_access.roles`, a custom `roles` claim, or nothing at all, the
  outcome is identical: DMS resolves the role itself.
- **Platform Admin is fail-closed.** `platform_admin` is granted *only* when the
  User Management Service positively says so. If the User Service is unreachable
  on a cache miss, the caller is treated as `member` — they never accidentally
  get admin rights.
- **Tenant isolation is enforced twice:** once in the middleware (the
  `tenant_members` membership check) and again in the service layer
  (`assertTenantAccess`). A `tenant_admin` of tenant A gets `403` for tenant B.

### Where each role fact comes from

| Fact | Source of truth | Why |
|---|---|---|
| Who you are (`userId`/`sub`) | Verified Keycloak JWT | Cryptographically proven, expires, revocable. |
| `platform_admin` | User Management Service `/api/role/{appId}` | Central RBAC; DMS does not hand out platform rights. |
| `tenant_admin` / `member` | DMS `tenant_members` table | DMS owns tenant membership; survives a User Service outage. |
| Document access level | DMS `document_permissions` table | Per-document grants (viewer/contributor/manager/owner). |

---

## 4. The login flow (now correct)

```
Browser (/login or /admin/login)
   │  POST { email, password }
   ▼
Sify User Management Service  ──►  /api/user/login
   │  returns { data: { accessToken, refreshToken, idToken,
   │                    user: { ..., role: { roleName: "Platform Admin" } },
   │                    app: { provider: "keycloak" } } }
   ▼
web/lib/api.ts  normalizeUserManagementLogin()
   │  • verifies it can read role from data.user.role.roleName   (Bug #1 fixed)
   │  • maps "Platform Admin" → platform_admin                   (unified)
   │  • calls /api/tenants/mine to enrich tenant memberships
   ▼
Session stored in the browser:
   { scope, tenantId, userId, roles: ["platform_admin"],
     accessToken, refreshToken, idToken, expiresAt }
```

Every subsequent browser request sends `Authorization: Bearer <accessToken>` and
`x-app-id: DMS` (and `x-tenant-id` when a workspace is selected). The backend
re-resolves the role on each call — it does **not** trust the role the browser
cached.

> If you prefer the browser to never call the User Service directly, point
> `authApi.login` at the DMS proxy `POST /api/auth/login` instead. The proxy
> does the same extraction server-side and warms the role cache.

---

## 5. The external-JWT scenario (tenant integrates their service with the DMS)

This is the requirement that drove the whole design:

> *"When I give tenants the upload and other DMS APIs to integrate their
> services, they will send a DIFFERENT JWT that does not have the role details.
> I cannot force them to modify their JWT. But the API auth must still happen
> securely."*

**The answer:** you do not need them to modify their JWT at all. As long as
their token is signed by the **same Keycloak realm** (so DMS can verify it) and
names a **client DMS trusts**, DMS authenticates the subject and resolves the
role itself.

### Why this is secure

- The tenant cannot elevate themselves. Even if they control their own client
  and their own token's claims, those claims are **ignored** for authorization.
  They are a `member` or `tenant_admin` only because DMS's own stores say so.
- The tenant cannot impersonate another user. The `sub` is bound to a
  cryptographically-signed token; forging it requires the realm's private key.
- DMS never accepts unsigned, expired, wrong-issuer, or wrong-audience tokens.

### Step-by-step: let a tenant service call the DMS

**Step 1 — The tenant's Keycloak client lives in the same realm.**

The tenant's application is configured as a Keycloak client in the `DMS` realm
(e.g. `tenant-acme-service`). When their service authenticates a user, Keycloak
issues a token with:

```json
{
  "iss": "http://1.6.37.35/keycloak/realms/DMS",
  "azp": "tenant-acme-service",
  "sub": "d9a9113f-dc51-429e-96c6-413ee4ffd2c8",
  "exp": 1787476820
  // … no DMS role claims at all …
}
```

**Step 2 — Register that client with DMS (one line of config).**

```dotenv
# .env  (comma-separated, in addition to DMS_APP_CLIENT_ID)
KEYCLOAK_ALLOWED_CLIENT_IDS=tenant-acme-service,tenant-globex-api
```

This adds the client to the audience allowlist
(`settings.keycloak.allowedClientIds`). DMS always accepts its own browser
client (`DMS_APP_CLIENT_ID`) automatically.

**Step 3 — Make sure the subject is a member of the target tenant.**

The tenant admin adds the user through the DMS UI
(`POST /api/tenants/{id}/users`), which writes the `tenant_members` row *and*
mirrors the role to the User Management Service. Now `sub` is a known, active
member.

**Step 4 — The tenant service forwards the token as-is.**

```bash
# Upload a document into the tenant's workspace using the tenant's own JWT.
curl -X POST https://dms.example.com/api/documents \
  -H "Authorization: Bearer ${TENANT_ACCESS_TOKEN}" \
  -H "x-app-id: DMS" \
  -H "x-tenant-id: 11111111-1111-1111-1111-111111111111" \
  -F "file=@invoice.pdf"
```

What happens inside DMS:

1. The JWT signature, issuer and expiry are verified against the realm JWKS.
2. `azp: tenant-acme-service` is in the allowlist → accepted.
3. `x-app-id: DMS` → accepted.
4. `RoleResolver` resolves the app role for `sub` (cached). Say it is `member`.
5. `tenant_members(user, tenant)` → `active`, role `member`.
6. `req.auth = { userId: sub, tenantId, roles: ["member"] }`.
7. `DocumentService.createUploadSession` runs; the creator gets `owner` access.

The tenant never touched the JWT. If that user is later promoted to
`tenant_admin` in the User Service / DMS, the next request (after the cache TTL)
authorizes them as an admin — no re-issue, no token change.

### What if the tenant is in a *different* realm?

If a tenant cannot use the `DMS` realm at all, do not weaken token verification.
Instead use one of:

- **A trusted gateway in front of DMS** that validates the tenant's IdP and
  injects the standard headers (see `docs/ROLES_AND_ACCESS.md`, Approach A). Run
  DMS with `AUTH_MODE=headers` on a private network reachable only by the
  gateway.
- **A service-to-service API key** for machine integrations, validated by an
  additional middleware that maps the key to a fixed tenant + `member` scope.
  (Not enabled by default; add it only if you have callers that are services,
  not users.)

---

## 6. Configuration reference

### Exact values for the Sify deployment

Your real access token decodes to `iss=…/realms/DMS`, `azp=DMS`, `aud=account`,
so the `.env` **must** use the uppercase realm and the `DMS` client:

```dotenv
AUTH_MODE=keycloak
DMS_APP_ID=DMS
DMS_APP_CLIENT_ID=DMS                 # the token's azp is "DMS"
DMS_APP_CLIENT_SECRET=<server-only secret for the DMS Keycloak client>

KEYCLOAK_BASE_URL=http://1.6.37.35/keycloak
KEYCLOAK_REALM=DMS                    # uppercase — Keycloak URLs are case-sensitive
KEYCLOAK_JWKS_URI=http://1.6.37.35/keycloak/realms/DMS/protocol/openid-connect/certs
KEYCLOAK_ISSUER=http://1.6.37.35/keycloak/realms/DMS
KEYCLOAK_CLOCK_TOLERANCE=15
KEYCLOAK_ALLOWED_CLIENT_IDS=          # extra integration clients only

ROLE_RESOLVER_ENABLED=true
ROLE_CACHE_TTL_SECONDS=60
```

### All variables

```dotenv
AUTH_MODE=keycloak                # 'headers' for local/dev only
DMS_APP_ID=DMS
DMS_APP_CLIENT_ID=dms-web         # always allowed in azp/aud
DMS_APP_CLIENT_SECRET=...         # server-only; used for refresh + service token

KEYCLOAK_BASE_URL=http://1.6.37.35/keycloak
KEYCLOAK_REALM=dms
KEYCLOAK_JWKS_URI=http://1.6.37.35/keycloak/realms/dms/protocol/openid-connect/certs
KEYCLOAK_ISSUER=http://1.6.37.35/keycloak/realms/dms
KEYCLOAK_CLOCK_TOLERANCE=15
KEYCLOAK_ALLOWED_CLIENT_IDS=      # extra clients for tenant integrations

ROLE_RESOLVER_ENABLED=true
ROLE_CACHE_TTL_SECONDS=60         # short TTL so role changes propagate fast
```

| Variable | Purpose |
|---|---|
| `KEYCLOAK_ALLOWED_CLIENT_IDS` | Comma-separated extra client ids accepted in `azp`/`aud`. The DMS client is always included. |
| `ROLE_RESOLVER_ENABLED` | Turn off only for the local header mode. |
| `ROLE_CACHE_TTL_SECONDS` | Per-user app-role cache lifetime. Lower = fresher roles, higher = fewer User Service calls. |

---

## 7. Worked examples

### 7.1 A Platform Admin lists tenants

```bash
# After signing in at /admin/login, the browser sends:
curl https://dms.example.com/api/tenants \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "x-app-id: DMS"
# → 200  (RoleResolver confirms platform_admin)
```

### 7.2 A Member is denied tenant-wide analytics

```bash
curl https://dms.example.com/api/tenants/1111.../analytics \
  -H "Authorization: Bearer ${MEMBER_TOKEN}" \
  -H "x-app-id: DMS" \
  -H "x-tenant-id: 1111..."
# → 403  "Tenant administrator role required to read analytics"
```

### 7.3 Cross-tenant isolation

```bash
# A tenant_admin of tenant A targets tenant B:
curl https://dms.example.com/api/tenants/BBBB.../documents \
  -H "Authorization: Bearer ${TENANT_A_ADMIN_TOKEN}" \
  -H "x-app-id: DMS" -H "x-tenant-id: BBBB..."
# → 403  "You do not belong to this tenant"
```

### 7.4 Tenant integration upload (the external-JWT case)

```bash
# The tenant's service forwards its own same-realm token. No role claim present.
curl -X POST https://dms.example.com/api/documents \
  -H "Authorization: Bearer ${TENANT_SERVICE_TOKEN}" \
  -H "x-app-id: DMS" -H "x-tenant-id: 1111..." \
  -F "file=@report.pdf"
# → 201  (verified, role resolved to member/tenant_admin from DMS stores)
```

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `401 Token not provided` | No `Authorization: Bearer` (or `idtoken`) header | Send the Keycloak access token. |
| `401 Invalid token` | Bad signature / expired / wrong issuer | Check `KEYCLOAK_*` vars; the realm JWKS must be reachable from the API host. |
| `401 Invalid token` (good signature, good JWKS) | **Realm name case mismatch.** Keycloak realm URLs are case-sensitive. The Sify realm is `DMS` (uppercase) — the token `iss` is `.../realms/DMS`. If `KEYCLOAK_REALM=dms` (lowercase), issuer verification fails. | Set `KEYCLOAK_REALM=DMS` and matching `KEYCLOAK_ISSUER` / `KEYCLOAK_JWKS_URI`. |
| `401 … not issued for this application` | Token's `azp`/`aud` not in the allowlist | The Sify token has `azp: "DMS"` (= the app id). The allowlist always includes `DMS_APP_CLIENT_ID` and `DMS_APP_ID`, so set `DMS_APP_CLIENT_ID=DMS`. Add other clients to `KEYCLOAK_ALLOWED_CLIENT_IDS`. |
| `403 Unknown or missing x-app-id` | Header absent or not `DMS` | Send `x-app-id: DMS`. |
| `403 … not issued for this application` | Token's `azp`/`aud` not in the allowlist | Add the client to `KEYCLOAK_ALLOWED_CLIENT_IDS`. |
| Admin sees `/admin` but `403 Platform administrator role required` on APIs | User Service says the user is not a Platform Admin, or it was unreachable on a cache miss | Confirm the role in the User Service; check connectivity; the role is resolved live, not cached forever. |
| `403 You do not belong to this tenant` | No active `tenant_members` row, or wrong `x-tenant-id` | Add the user to the tenant; check the tenant id. |
| Login always returns `member` (old bug) | Fixed: role is read from `data.user.role.roleName` | Redeploy with this change. |
| Role change has no effect | Still inside the `ROLE_CACHE_TTL_SECONDS` window | Wait ≤ 60s, or lower the TTL, or call `roleResolver.invalidate(userId)`. |

---

## 9. Security checklist before production

- [ ] `AUTH_MODE=keycloak`; `AUTH_ALLOW_DEV_HEADERS=false`.
- [ ] `DMS_APP_CLIENT_SECRET` set and never exposed to the browser.
- [ ] `KEYCLOAK_ALLOWED_CLIENT_IDS` lists **only** real integration clients.
- [ ] `platform_admin` granted to operators only, in the User Management Service.
- [ ] Each tenant integration client maps to users who have a real `tenant_members` row.
- [ ] `ROLE_CACHE_TTL_SECONDS` is short enough for your change-propagation SLA.
- [ ] The API host can reach the Keycloak JWKS URL and the User Management Service.
- [ ] Tokens are short-lived; refresh uses the server-side confidential client.
- [ ] Audit log shows the expected `actorId` after a test upload by an integration.

---

## 10. Where to look in the code

| Concern | File |
|---|---|
| Role constants + display-name → id mapping | `src/utils/roles.ts` |
| User Service role-name extraction (one place) | `src/utils/userServiceRoles.ts` |
| Authoritative role resolution + cache | `src/service/roleResolver.ts` |
| JWT verification (signature, issuer, expiry, audience allowlist) | `src/config/keycloak.ts` |
| Auth middleware (auth → resolve role → attach `req.auth`) | `src/middleware/authorization.ts` |
| Login / refresh / logout | `src/controller/express/authController.ts` |
| Tenant isolation + role checks | `src/service/tenantService.ts` |
| Per-document access levels | `src/utils/accessControl.ts`, `src/service/documentService.ts` |
| Configuration | `src/config/settings.ts`, `.env.example` |
| Frontend role mapping + login | `web/lib/api.ts`, `web/lib/session.ts`, `web/app/login/page.tsx`, `web/app/admin/login/page.tsx` |
