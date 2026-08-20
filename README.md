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

With `AUTH_DISABLED=true` (the example `.env`):

```bash
curl -s http://localhost:3000/api/tenants/me \
  -H "x-tenant-id: 11111111-1111-1111-1111-111111111111" \
  -H "x-user-id: alice" \
  -H "x-roles: tenant_admin"
```

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

- `/login` — tenant workspace sign-in (`/login?workspace=<id>` pre-fills the workspace)
- `/admin/login` — platform administrator sign-in
- `/admin` — tenant onboarding and directory (first page for administrators)
- `/admin/tenants/{id}` — tenant details, handover information and usage analytics, plus that tenant's documents, folders, trash, people and settings
- `/workspace` — the signed-in tenant's own workspace

```bash
# API on :3001 (see .env), then:
cd web && npm install && npm run dev
# → http://localhost:3000  (proxies /api/* to DMS_API_URL)
```

See [web/README.md](./web/README.md).

The API must run with `AUTH_DISABLED=true` (and usually `PORT=3001`) for the header-based session. With `AUTH_DISABLED=false` the UI sends the identity token entered at sign-in.

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
