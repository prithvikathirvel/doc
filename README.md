# Document Management System

Vendor-agnostic, tenant-oriented DMS. The same API stores files in **AWS S3**, **MinIO**, **Google Cloud Storage**, or **Azure Blob Storage**. The application never talks to a vendor SDK directly — adapters sit behind a storage port and a registry.

Workflows, stages, instances, and handlers from the previous service are **not** part of this system.

## What you get

- Tenant-scoped documents, folders, versions, and permissions
- Per-tenant storage provider (A → S3, B → MinIO, C → GCS, D → Azure)
- Signed upload/download URLs so large files do not pass through the API
- DMS-level versioning (not vendor object versioning)
- Soft delete, restore, and permanent delete with storage cleanup
- Generic storage errors (vendor exceptions never leak)
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

## Project layout

```
src/
  domain/            entities, ports, errors
  application/       use cases (no vendor SDKs)
  infrastructure/
    storage/         s3 | minio | gcp | azure | fake
    database/mysql/  metadata repositories
  api/               HTTP, auth, swagger
  tests/             unit + contract + optional live integration
sql/                 schema.sql, seed.sql
docs/                ONBOARDING.md, ARCHITECTURE.md
```

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
