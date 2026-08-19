# Tenant onboarding and usage

This DMS is tenant-oriented. Every document, folder, permission, and storage object is scoped to a tenant. Each tenant is bound to exactly one storage provider (AWS S3, MinIO, Google Cloud Storage, or Azure Blob Storage). The public API never changes when the provider changes.

## SQL tables you need

Run `sql/schema.sql` against MySQL 8. That creates:

| Table | Purpose |
|---|---|
| `tenants` | Customer record, owner contact, file-size limit, allowed MIME types |
| `storage_configs` | Which vendor that tenant uses, plus **secret references** (env var names), never raw keys |
| `folders` | Optional folder tree per tenant |
| `documents` | Document metadata and a generic storage pointer (`provider` + `container` + `object key`) |
| `document_versions` | DMS-level versions. Each version has its own storage key |
| `document_permissions` | User/role grants on a document |
| `audit_logs` | Who did what, with provider and duration. No file bytes, no credentials |

The binary file itself is **not** stored in MySQL. It lives in the tenant's bucket/container.

Upgrading an existing database? Apply the files in `sql/migrations/` in order.

Optional demo data: `sql/seed.sql` (Acme tenant on local MinIO).

---

## How to onboard a new customer

Do this once per customer. Nothing in application code needs to change.

The fastest route is the admin console: sign in at `/login` as an administrator and use
**Onboard tenant** on `/admin`. The wizard collects the organisation, the owner contact and
the storage configuration, validates the provider fields, and finishes with the handover
details (tenant ID, workspace URL, owner sign-in) that you give to the customer.

The steps below are the equivalent API calls.

### 1. Create their object storage

Create an isolated bucket/container. Do not share it with another tenant.

- **AWS S3:** bucket, IAM user or role with `s3:PutObject`, `GetObject`, `DeleteObject`, `ListBucket`, and (recommended) `s3:PutObjectAcl` not required. Enable CORS if browsers will PUT directly.
- **MinIO:** bucket plus access/secret key. CORS if browsers upload directly.
- **GCP:** bucket plus a service-account JSON that can `storage.objects.create/get/delete`.
- **Azure:** storage account + container plus account key (used only on the server to mint SAS URLs).

### 2. Put credentials in the environment — not in SQL, not in source

On the DMS host (or secret manager that populates env vars):

```env
TENANT_ACME_ACCESS_KEY=...
TENANT_ACME_SECRET_KEY=...
```

For GCP you can point at a file:

```env
TENANT_ACME_GCP_CREDENTIALS=/secure/acme-sa.json
```

The database stores the **name** of those variables (`TENANT_ACME_ACCESS_KEY`), never the value.

### 3. Create the tenant

You need a platform-admin token (or `AUTH_DISABLED=true` plus `x-roles: platform_admin` for local setup).

```bash
curl -s -X POST http://localhost:3000/api/tenants \
  -H "content-type: application/json" \
  -H "idtoken: $PLATFORM_JWT" \
  -d '{
    "name": "Acme Corp",
    "slug": "acme",
    "ownerName": "Jane Doe",
    "ownerEmail": "jane@acme.com",
    "maxFileSizeBytes": 52428800,
    "storage": {
      "provider": "s3",
      "container": "acme-documents",
      "region": "ap-south-1",
      "accessKeyRef": "TENANT_ACME_ACCESS_KEY",
      "secretKeyRef": "TENANT_ACME_SECRET_KEY"
    }
  }'
```

Save the returned `tenant.id`. The `storage` block is optional; when present it is validated
before the tenant row is written, so onboarding never half-succeeds. `ownerEmail` is the
address that signs in as the workspace administrator.

Alternatively insert into `tenants` with `sql/seed.sql` as a template.

### 4. Attach their storage provider

Same API for every vendor. Only the fields the provider actually uses are accepted —
anything else is rejected with a validation error, so a tenant can never keep a stale
endpoint after switching provider. `GET /api/tenants/storage-providers` returns the exact
field list per provider.

| Provider | Required | Optional |
|---|---|---|
| `s3` | `container`, `region` | `endpoint`, `accessKeyRef` + `secretKeyRef`, `sessionTokenRef`, `basePrefix`, `signedUrlTtlSeconds` |
| `minio` | `container`, `endpoint`, `accessKeyRef`, `secretKeyRef` | `region`, `useSsl`, `basePrefix`, `signedUrlTtlSeconds` |
| `gcp` | `container`, `projectId` | `credentialsJsonRef`, `basePrefix`, `signedUrlTtlSeconds` |
| `azure` | `container`, `accountName`, `secretKeyRef` | `endpoint`, `basePrefix`, `signedUrlTtlSeconds` |

**MinIO**

```bash
curl -s -X PUT http://localhost:3000/api/tenants/$TENANT_ID/storage \
  -H "content-type: application/json" \
  -H "idtoken: $PLATFORM_JWT" \
  -H "x-tenant-id: $TENANT_ID" \
  -d '{
    "provider": "minio",
    "container": "acme-documents",
    "endpoint": "https://minio.acme.internal:9000",
    "region": "us-east-1",
    "accessKeyRef": "TENANT_ACME_ACCESS_KEY",
    "secretKeyRef": "TENANT_ACME_SECRET_KEY",
    "useSsl": true,
    "basePrefix": "dms",
    "signedUrlTtlSeconds": 900
  }'
```

**AWS S3**

```json
{
  "provider": "s3",
  "container": "acme-documents",
  "region": "ap-south-1",
  "accessKeyRef": "TENANT_ACME_ACCESS_KEY",
  "secretKeyRef": "TENANT_ACME_SECRET_KEY"
}
```

**Google Cloud Storage**

```json
{
  "provider": "gcp",
  "container": "acme-documents",
  "projectId": "acme-prod",
  "credentialsJsonRef": "TENANT_ACME_GCP_CREDENTIALS"
}
```

**Azure Blob Storage**

```json
{
  "provider": "azure",
  "container": "acme-documents",
  "accountName": "acmeprod",
  "secretKeyRef": "TENANT_ACME_AZURE_KEY"
}
```

Restart is not required. The resolver caches by tenant and refreshes when this config is saved.

### 5. Issue tenant users a JWT

The token must contain:

| Claim | Meaning |
|---|---|
| `sub` | user id |
| `preferred_username` or `name` | display name |
| `tenant_id` (or `tid`) | the tenant UUID from step 3 |
| `roles` | e.g. `tenant_admin`, or leave empty for regular users |

If the IdP cannot emit `tenant_id`, the client may send `x-tenant-id`. Every query is still filtered by that tenant — a user cannot read another tenant's rows even if they guess a document id.

Give `tenant_admin` to the customer's administrators: they see every document in the tenant
and can configure storage. Members (`member`) only list and open documents they created or
were granted access to.

---

## How the customer uses the product

Base URL: `http://<host>:3000/api`  
Interactive docs: `http://<host>:3000/api-docs`

Always send:

```
idtoken: <jwt>
x-tenant-id: <tenant-uuid>   # optional if the JWT already has tenant_id
```

### Upload a large file (preferred)

The file goes **directly to S3 / MinIO / GCS / Azure**. The DMS never sees the bytes.

```bash
# 1) Ask the DMS for an upload session
SESSION=$(curl -s -X POST http://localhost:3000/api/documents \
  -H "content-type: application/json" \
  -H "idtoken: $USER_JWT" \
  -H "idempotency-key: invoice-2026-08-19" \
  -d '{"filename":"invoice.pdf","mimeType":"application/pdf","name":"August invoice"}')

DOCUMENT_ID=$(echo "$SESSION" | jq -r .document.id)
UPLOAD_URL=$(echo "$SESSION" | jq -r .upload.url)

# 2) PUT the file at the signed URL (vendor is invisible to the caller)
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: application/pdf" \
  --data-binary @invoice.pdf

# 3) Tell the DMS the object is there
curl -s -X POST http://localhost:3000/api/documents/$DOCUMENT_ID/upload \
  -H "idtoken: $USER_JWT"
```

If the same `Idempotency-Key` is retried, the same document is returned. No duplicate object.

### Upload a small file through the API

```bash
curl -X POST http://localhost:3000/api/documents \
  -H "idtoken: $USER_JWT" \
  -F "file=@notes.txt" \
  -F "filename=notes.txt" \
  -F "name=Meeting notes"
```

### Download

```bash
curl -s -X POST http://localhost:3000/api/documents/$DOCUMENT_ID/download \
  -H "idtoken: $USER_JWT"
# -> { "download": { "url": "...", "expiresAt": "..." } }

# fallback stream through the API
curl -L http://localhost:3000/api/documents/$DOCUMENT_ID/content \
  -H "idtoken: $USER_JWT" -o invoice.pdf
```

### Folders, versions, delete, permissions

```bash
# folder
curl -X POST /api/folders -d '{"name":"Contracts"}' -H "idtoken: $USER_JWT" -H "content-type: application/json"

# new version of an existing document
curl -X POST /api/documents/$DOCUMENT_ID/versions -d '{"filename":"invoice.pdf"}' ...

# soft delete / restore / permanent delete
curl -X DELETE /api/documents/$DOCUMENT_ID
curl -X POST   /api/documents/$DOCUMENT_ID/restore
curl -X DELETE "/api/documents/$DOCUMENT_ID?permanent=true"

# share with a colleague or a role
curl -X POST /api/documents/$DOCUMENT_ID/permissions \
  -d '{"principalType":"user","principalId":"user-42","level":"contributor"}'
```

### Access levels

| Level | Can do |
|---|---|
| `viewer` | View and download the document and its versions |
| `contributor` | Viewer, plus rename and upload new versions |
| `manager` | Contributor, plus move to trash |
| `owner` | Manager, plus grant and revoke access |

`GET /api/documents/:id/permissions` returns the grants, the caller's effective access and the
available levels. Granting the same principal again updates the existing grant. The document
creator keeps owner access and cannot be revoked, and tenant administrators always have full
access.

The customer never chooses a vendor in these calls. The tenant's storage config decides whether the signed URL is an S3 presigned URL, a MinIO URL, a GCS v4 URL, or an Azure SAS.

---

## Switching a tenant to another vendor later

1. Create the new bucket/container and env vars.
2. `PUT /api/tenants/:id/storage` with the new provider.
3. New uploads go to the new vendor. Existing documents keep their original `storage_provider` / `storage_key` and continue to download from the old location until you migrate objects.

No application code change.

---

## Adding a brand-new vendor (for engineers)

1. Implement `StorageProvider` in `src/infrastructure/storage/<vendor>/`.
2. `storageRegistry.register("digitalocean", (config) => new DigitalOceanProvider(config))`.
3. Extend the `provider` enum in `sql/schema.sql`.

Do not touch `DocumentService` or the HTTP routes.
