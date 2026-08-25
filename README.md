# Document Management System

Vendor-agnostic, tenant-oriented DMS. The same API stores files in **AWS S3**, **MinIO**, **Google Cloud Storage**, or **Azure Blob Storage**. The application never talks to a vendor SDK directly — adapters sit behind a storage port and a registry.

## What you get

- Tenant onboarding with per-tenant storage configuration and usage analytics
- Tenant-scoped documents, folders, versions, and permissions
- Per-tenant storage provider (A → S3, B → MinIO, C → GCS, D → Azure)
- Signed upload/download URLs so large files do not pass through the API
- Object keys laid out as `<basePrefix>/<tenantId>/<userId>/<documentId>/v<n>/<filename>`
- Recursive folder delete: sub-folders and their documents are removed in one transaction
- DMS-level versioning (not vendor object versioning)
- Soft delete, restore, and permanent delete with storage cleanup
- Generic storage errors (vendor exceptions never leak)
- Document access granted as one level: viewer, contributor, manager or owner
- Structured audit logs and in-process metrics
- Swagger UI at `/api-docs`

## Stack

Node.js 18+, TypeScript, Express, MySQL 8.

## Quick start

```bash
cp .env.example .env
docker compose up -d
mysql -h 127.0.0.1 -u root -proot < sql/schema.sql
mysql -h 127.0.0.1 -u root -proot < sql/seed.sql
npm install
npm test
npm run serve:express-dev
```

- API: http://localhost:3000/api
- Health: http://localhost:3000/api/health
- Swagger: http://localhost:3000/api-docs
- MinIO console: http://localhost:9001 (`minioadmin` / `minioadmin`)

With `AUTH_DISABLED=true` (the example `.env`), trusted-header mode is on for API clients:

```bash
curl -s http://localhost:3000/api/tenants/me \
  -H "x-tenant-id: 11111111-1111-1111-1111-111111111111" \
  -H "x-user-id: alice" \
  -H "x-roles: tenant_admin"
```

For real deployments, point the API at the User Service / Keycloak (`.env`):

```bash
USER_MGT_BASE_URL=https://apidev.sifymodernization.digital/user-mgt
KEYCLOAK_BASE_URL=http://1.6.37.35/keycloak
KEYCLOAK_REALM=DMS
KEYCLOAK_CLIENT_ID=DMS
KEYCLOAK_CLIENT_SECRET=...        # the DMS client secret from app_auth_config
DMS_PLATFORM_ADMINS=ops@yourcompany.com
AUTH_DISABLED=false
mysql -h 127.0.0.1 -u root -proot dms < sql/migrations/2026_08_auth_rbac.sql
```

The web UI then signs in with email + password; tokens live in httpOnly cookies
verified against the realm's keys. Machine clients use API keys
(`x-api-key`, created in the console at `/admin/api-keys`) or — during
migration — the trusted headers above. Full reference:
**[docs/user-service-integration.md](docs/user-service-integration.md)**.

Driving the DMS as a **headless backend** from another application (API key only,
no web UI)? See **[docs/api-key-integration.md](docs/api-key-integration.md)** —
the `tenant_admin` key + `x-user-id` attribution setup, with copy-paste curls for
upload, folders, versions, sharing and admin.

## Roles

| Role | Scope |
|---|---|
| `platform_admin` | Onboards tenants, reads any tenant, acts as administrator inside any tenant it targets |
| `tenant_admin` | Full control of one tenant (`admin` is accepted as an alias) |
| `member` | Access decided by document permission grants |

## Access levels

Document grants are stored as capability flags and exchanged as one level:

| Level | read | write | delete | share |
|---|---|---|---|---|
| `viewer` | ✓ | | | |
| `contributor` | ✓ | ✓ | | |
| `manager` | ✓ | ✓ | ✓ | |
| `owner` | ✓ | ✓ | ✓ | ✓ |

Members only list documents they created or were granted access to. The document creator
keeps owner access and cannot be revoked.

## Web UI

A Next.js frontend lives in [`web/`](./web):

- `/login` — email + password sign-in (Keycloak via the User Service); members land in their workspace, administrators are redirected to the console
- `/signup` — self-signup; a workspace administrator then assigns the workspace
- `/select-workspace` — picker for accounts with several workspaces
- `/pending` — account exists, workspace not yet assigned
- `/admin/login` — same credentials; only DMS-directory platform administrators reach the console
- `/admin` — tenant onboarding and directory (first page for administrators), `/admin/api-keys` for machine-client keys
- `/admin/tenants/{id}` — tenant details, handover information and usage analytics, plus that tenant's documents, folders, trash, people and settings
- `/workspace` — the signed-in member's own workspace

```bash
# API on :3001 (see .env), then:
cd web && npm install && npm run dev
# → http://localhost:3000  (proxies /api/* to DMS_API_URL)
```

No MySQL or bucket at hand? Run the UI against the in-memory preview API:

```bash
npx ts-node --transpile-only scripts/dev-preview-api.ts          # API on :3001, seeded
cd web && DMS_API_URL=http://127.0.0.1:3001 npm run dev          # UI on :3000
```

See [web/README.md](./web/README.md).

The API must run with `AUTH_DISABLED=true` for the in-memory preview (it seeds
local accounts with password `preview` — see `scripts/dev-preview-api.ts`).
With the User Service / Keycloak configured, the UI signs in at
`/api/auth/login` and keeps tokens in httpOnly cookies.

## Serving the UI under a path prefix (/dms)

To serve the UI under `/dms` (e.g. alongside other apps behind one host), set one
variable in `web/.env` — it is the single source of truth for the prefix:

```bash
NEXT_PUBLIC_BASE_PATH=/dms
DMS_API_URL=https://apidev.sifymodernization.digital/dms
```

`NEXT_PUBLIC_BASE_PATH` drives `basePath` in `next.config.ts` **and** is read by
the API client (`web/lib/basePath.ts`), so every `/api` call and every URL the UI
shows to users (the tenant sign-in handover link, the docs share link) includes
the prefix. Without it, calls resolve to `/api/...` (no prefix), miss the proxy
rewrite, and return `405 Not Allowed` from the edge.

## Shareable developer documentation

A platform administrator can generate a per-tenant, shareable API reference from
the console: **Tenant → API docs** (`/admin/tenants/{id}/docs`). Pick which
operations to include, set a title/intro and API base, then copy the share link.
The link opens a public, branded page (`/docs/{token}`) rendering each selected
endpoint with headers, payload, cURL and an example response — using placeholder
values only, never secrets. Tenant members see the same link on their workspace
**Settings** page. Configuration lives in the `dms_tenant_docs` table
(see `sql/migrations/2026_08_tenant_docs.sql`). The operation catalogue is
**derived from the live OpenAPI spec** (`src/swagger.ts`), so endpoints,
parameters and request fields stay in sync with the API automatically — only
titles, categories and example responses are curated in `src/service/docsCatalog.ts`.

## Project layout

```
src/
  config/            environment and dependency container
  controller/express Express controllers
  dao/               mysql repositories and storage adapters (s3 | minio | gcp | azure | fake)
  dbConnection/      MySQL pool
  middleware/        authentication and error handling
  route/             Express routes
  service/           use cases (no vendor SDKs)
  utils/             roles, access control, logging, metrics
  validator/         request schemas
  tests/             unit + contract + optional live integration
sql/                 schema.sql, seed.sql, migrations/
docs/                ONBOARDING.md, ARCHITECTURE.md
```

## How to use it (admin → tenant → upload)

Full layman walkthrough (Windows PowerShell, every header, every API):

- **[docs/DMS_STEP_BY_STEP_GUIDE.docx](docs/DMS_STEP_BY_STEP_GUIDE.docx)** — Word document
- **[docs/STEP_BY_STEP_GUIDE.html](docs/STEP_BY_STEP_GUIDE.html)** — open in a browser or Word; print to PDF
- **[docs/STEP_BY_STEP_GUIDE.md](docs/STEP_BY_STEP_GUIDE.md)** — same content in Markdown

## Roles, permissions and external authentication

Who can do what, how document access is evaluated, and how to connect an external identity
provider without changing DMS code: **[docs/ROLES_AND_ACCESS.md](docs/ROLES_AND_ACCESS.md)**.

## Storage configuration

Per-provider field reference, real sample values and where to obtain them:
**[docs/STORAGE_CONFIGURATION.md](docs/STORAGE_CONFIGURATION.md)**.

## Onboarding a customer

See **[docs/ONBOARDING.md](docs/ONBOARDING.md)** for:

- the SQL tables you must create
- how to attach S3 / MinIO / GCS / Azure to a new tenant
- how that customer uploads, downloads, versions, and shares documents

Architecture notes: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Tests

```bash
npm test                          # FakeStorageProvider + DocumentService
RUN_INTEGRATION=true npm test     # also hits live vendors when IT_* env vars are set
```

Adding DigitalOcean Spaces or Cloudflare R2 later means writing one adapter and calling `storageRegistry.register(...)`. Document APIs stay the same.

## AWS deployment and secrets

See [`docs/AWS_CONSOLE_AND_SECRETS.md`](docs/AWS_CONSOLE_AND_SECRETS.md) for the exact AWS Console checklist, IAM policy guidance, and examples for Secrets Manager and SSM Parameter Store. Do not commit `.env` or put credentials in Swagger requests.

## Brand kit

Logo, icon/favicon sources, rendered PNGs, a multi-size `favicon.ico`, the Open
Graph image and an editable onboarding `.docx` template live in
[`brand/`](./brand) (see [`brand/README.md`](brand/README.md)). The web app
consumes the favicon, app icon, apple-touch-icon and OG image via Next.js file
conventions in `web/app/`; set `NEXT_PUBLIC_SITE_URL` to your production origin
so absolute SEO/OG URLs resolve correctly.
