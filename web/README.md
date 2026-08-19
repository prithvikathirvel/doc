# DMS Web UI

Minimal Next.js 15 frontend for the vendor-agnostic Document Management System.

## Features

- **Session identity** — tenant / user / roles (header-based local auth)
- **Overview** — tenant snapshot, storage status, recent documents
- **Documents** — list, search, upload (direct + signed URL), rename, download, share, trash
- **Document detail** — versions, permissions, metadata, restore / permanent delete
- **Folders** — nested browse, create, rename, delete
- **Trash** — restore or permanently erase
- **Tenants (admin)** — create tenants, attach S3 / MinIO / GCS / Azure (env-var refs)
- **Health** — API health + metrics
- **Settings** — edit session headers

## Stack

- Next.js 15 (App Router)
- Tailwind CSS 4
- Lucide icons, Sonner toasts
- Proxies `/api/*` → Express DMS (`DMS_API_URL`)

## Run

```bash
# Terminal 1 — API (repo root)
cp .env.example .env   # set PORT=3001, AUTH_DISABLED=true, MySQL, MinIO refs
docker compose up -d
mysql … < sql/schema.sql && mysql … < sql/seed.sql
npm install && npm run serve:express-dev

# Terminal 2 — UI
cd web
cp .env.example .env.local   # DMS_API_URL=http://127.0.0.1:3001
npm install
npm run dev
```

Open http://localhost:3000 — use the Alice demo preset (tenant `11111111-…`).

## Theme

Soft slate canvas (`#f8fafc`), indigo accent (`#4f46e5`), white cards, 13px body, low-contrast borders — see the design system in the product brief.


## How to get a JWT for a tenant

This DMS **does not have a login API**. It does not mint tokens. Tokens come from:

1. **Local/dev (easiest with JWT mode):** mint one with the repo script (below)
2. **Production:** your company IdP (Keycloak, Auth0, Cognito, Azure AD, etc.) after the user signs in

### Claims the API requires

| Claim | Required | Example |
|---|---|---|
| `sub` (or `user_id`) | yes | `alice` |
| `preferred_username` or `name` or `email` | yes | `Alice Kumar` |
| `tenant_id` or `tid` or `tenantId` | yes\* | `11111111-1111-1111-1111-111111111111` |
| `roles` / `role` / `realm_access.roles` | optional | `["tenant_admin"]` |

\* If the JWT has no tenant claim, still send header `x-tenant-id: <tenant-uuid>`.

### Path A — Skip JWT entirely (recommended while learning)

```bash
# API .env
AUTH_DISABLED=true
PORT=3001
```

Restart API. UI only needs tenant/user/roles headers (presets on Login). **No token.**

### Path B — Mint a dev JWT for a specific tenant

1. Put the same secret on the API:

```bash
# API .env
AUTH_DISABLED=false
JWT_SECRET=dev-secret
PORT=3001
```

2. Restart the API.

3. Mint a token for the demo Acme tenant (or any tenant UUID you created):

```bash
# from repo root (needs npm install so jsonwebtoken is available)
npm run mint:jwt
# or custom:
node scripts/mint-dev-jwt.mjs   --tenant 11111111-1111-1111-1111-111111111111   --sub alice   --name "Alice Kumar"   --roles tenant_admin   --secret dev-secret
```

4. Copy the printed JWT.

5. In the web UI → **Login** or **Settings** → paste into **JWT idtoken** → save.

6. Call APIs (or let the UI do it). The UI sends:

```
idtoken: <jwt>
Authorization: Bearer <jwt>
x-tenant-id: <tenant-uuid>   # still sent; optional if JWT has tenant_id
```

### Path C — Real IdP (production)

1. Create/configure a client in Keycloak / Auth0 / Cognito / Azure AD.
2. Map custom claims so the access/ID token includes `sub`, a name claim, `tenant_id` (your DMS tenant UUID), and `roles`.
3. Your app’s login flow obtains that token after the user authenticates.
4. Pass it to the DMS as `idtoken` (or Bearer). Set `JWT_SECRET` only if you use HS256 shared secret; for RS256 IdPs you typically extend the middleware to verify with the IdP JWKS (not built-in today — current code uses `JWT_SECRET` with `jwt.verify`, or unsigned decode if secret is empty).

**Important:** If `JWT_SECRET` is empty, the API only **decodes** the JWT (no signature check). Fine for local experiments; never do that in production.

### Per-tenant tokens

There is no separate “tenant login” endpoint. A token is “for a tenant” when its payload contains that tenant’s UUID:

```json
{
  "sub": "alice",
  "name": "Alice Kumar",
  "tenant_id": "11111111-1111-1111-1111-111111111111",
  "roles": ["tenant_admin"]
}
```

Issue a **different JWT** (different `tenant_id` and usually different `sub`) for each customer/user. The DMS filters every query by that tenant id.
