# Document Management System — full step-by-step guide

A no-jargon walkthrough: start the system, register a customer (tenant), attach AWS / MinIO / Google / Azure, then upload and download files.

Open the printable version in a browser: [STEP_BY_STEP_GUIDE.html](./STEP_BY_STEP_GUIDE.html)  
(File → Print → Save as PDF, or open the HTML in Microsoft Word.)

---

## What this system is

A **filing cabinet in the cloud**. The cabinet can live in different warehouses:

- **AWS S3** — Amazon
- **MinIO** — a warehouse on your own PC (best for learning)
- **Google Cloud Storage** — Google
- **Azure Blob Storage** — Microsoft

| Word | Meaning |
|---|---|
| Tenant | One customer / company. Their files never mix with another company. |
| Admin | Creates tenants and points each one at a warehouse. |
| User | An employee who uploads and downloads documents. |
| API | A web address. You can also click the same actions in Swagger. |
| Header | A name-tag on every request, like “I am Alice from Acme”. |
| Signed URL | A temporary door (about 15 minutes) so the file goes **directly** to the warehouse. The user never sees the warehouse password. |
| Secret | The warehouse password. It stays on the server only. |

The same upload API works for every warehouse. Only the admin chooses the vendor.

---

## Part A — One-time setup on Windows

### Step 1 — Install tools (once)

1. **Node.js LTS** — https://nodejs.org — then a **new** PowerShell: `node -v`
2. **Docker Desktop** — start it and wait until the whale icon is steady
3. **Git** if you do not have it

You do **not** need an Amazon / Google / Azure account to practise. Local MinIO is enough.

### Step 2 — Settings file

```powershell
cd C:\path\to\doc
copy .env.example .env
notepad .env
```

Leave it as-is for local practice.

| Line | Meaning |
|---|---|
| `AUTH_DISABLED=true` | No real login. You identify yourself with headers. |
| `MYSQL_*` | Metadata database (names and sizes, not the files). |
| `MINIO_ACCESS_KEY=minioadmin` | Local warehouse user. |
| `MINIO_SECRET_KEY=minioadmin` | Local warehouse password. |

### Step 3 — Start MySQL and MinIO

```powershell
docker compose up -d
docker compose ps
```

MinIO console: http://localhost:9001 — login `minioadmin` / `minioadmin`.

If `docker compose` is missing, try `docker-compose up -d`.

### Step 4 — Create tables

```powershell
Get-Content sql\schema.sql | docker compose exec -T mysql mysql -uroot -proot
Get-Content sql\seed.sql   | docker compose exec -T mysql mysql -uroot -proot
```

| Table | Meaning |
|---|---|
| tenants | Customers |
| storage_configs | Which warehouse + **names** of secret env vars (not the secrets) |
| folders | Folders |
| documents | Each file’s index card |
| document_versions | Old copies |
| document_permissions | Who may read / write / delete |
| audit_logs | Diary |

`seed.sql` creates practice customer **Acme Demo**:

- Tenant id: `11111111-1111-1111-1111-111111111111`
- Warehouse: local MinIO, bucket `documents`

### Step 5 — Start the DMS

```powershell
npm install
npm test
npm run serve:express-dev
```

Leave that window open.

| Address | What you should see |
|---|---|
| http://localhost:3000/api/health | `"status":"ok"` and providers listed |
| http://localhost:3000/api-docs | Swagger forms |

---

## Part B — Who you are

With `AUTH_DISABLED=true` every request still needs headers:

| Header | Admin | Acme employee |
|---|---|---|
| `x-tenant-id` | The tenant UUID (or `bootstrap` only when creating the first tenant) | That company’s UUID |
| `x-user-id` | `admin-1` | `alice` |
| `x-user-name` | `Platform Admin` | `Alice Kumar` |
| `x-roles` | `platform_admin` to create tenants; `tenant_admin` to attach storage | empty, or `tenant_admin` |

In production: `AUTH_DISABLED=false`, send a JWT in `idtoken` with `sub`, name, and `tenant_id`.

**Always type `curl.exe` in PowerShell**, not `curl`.

```powershell
$base = "http://localhost:3000/api"
$tenant = "11111111-1111-1111-1111-111111111111"
```

---

## Part C — Admin: register tenant and attach warehouse

### Step 6 — Create a customer

Skip if you use the seeded Acme id. To practise:

```powershell
curl.exe -s -X POST "$base/tenants" -H "content-type: application/json" `
  -H "x-tenant-id: bootstrap" `
  -H "x-user-id: admin-1" `
  -H "x-roles: platform_admin" `
  -d "{`"name`":`"Acme Corp`",`"slug`":`"acme-corp`",`"maxFileSizeBytes`":52428800}"
```

Copy `tenant.id` into `$tenant`.

| Field | Meaning |
|---|---|
| name | Display name |
| slug | Unique short name, lowercase |
| maxFileSizeBytes | 52428800 = 50 MB |

### Step 7 — Put warehouse passwords on the machine

The database stores **only the name** of an environment variable.

Local MinIO is already in `.env`. For real AWS:

```powershell
setx TENANT_ACME_ACCESS_KEY "AKIA................"
setx TENANT_ACME_SECRET_KEY "wJal................"
```

Or add the same lines to `.env` and **restart** the Node process.

| Vendor | Env vars |
|---|---|
| AWS S3 | `TENANT_ACME_ACCESS_KEY` + `TENANT_ACME_SECRET_KEY` |
| MinIO | `MINIO_ACCESS_KEY` + `MINIO_SECRET_KEY` |
| GCP | `TENANT_ACME_GCP_SA` = path to service-account JSON |
| Azure | `TENANT_ACME_AZURE_KEY` = account key; account **name** is not secret |

Never paste `AKIA...` into the API body.

### Step 8 — Attach the warehouse

**MinIO (do this first)**

```powershell
curl.exe -s -X PUT "$base/tenants/$tenant/storage" `
  -H "content-type: application/json" `
  -H "x-tenant-id: $tenant" `
  -H "x-user-id: admin-1" `
  -H "x-roles: tenant_admin" `
  -d "{
    `"provider`": `"minio`",
    `"container`": `"documents`",
    `"endpoint`": `"http://127.0.0.1:9000`",
    `"region`": `"us-east-1`",
    `"accessKeyRef`": `"MINIO_ACCESS_KEY`",
    `"secretKeyRef`": `"MINIO_SECRET_KEY`",
    `"useSsl`": false,
    `"basePrefix`": `"dms`",
    `"signedUrlTtlSeconds`": 900
  }"
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

**GCP**

```json
{
  "provider": "gcp",
  "container": "acme-documents",
  "projectId": "acme-prod",
  "credentialsJsonRef": "TENANT_ACME_GCP_SA"
}
```

**Azure**

```json
{
  "provider": "azure",
  "container": "acme-documents",
  "accountName": "acmeprod",
  "secretKeyRef": "TENANT_ACME_AZURE_KEY"
}
```

### Step 9 — Confirm

```powershell
curl.exe -s "$base/tenants/me" `
  -H "x-tenant-id: $tenant" -H "x-user-id: admin-1" -H "x-roles: tenant_admin"
```

You should see `storage.provider` and `storage.container`. Refs only — no passwords.

---

## Part D — Tenant user: folders and files

These APIs never mention S3 or MinIO.

### Step 10 — Folder (optional)

```powershell
curl.exe -s -X POST "$base/folders" `
  -H "content-type: application/json" `
  -H "x-tenant-id: $tenant" `
  -H "x-user-id: alice" `
  -H "x-user-name: Alice Kumar" `
  -H "x-roles: tenant_admin" `
  -d "{`"name`":`"Contracts`"}"
```

Copy `folder.id`. Nest with `"parentId":"..."`.  
List: `GET /api/folders`  
Rename: `PATCH /api/folders/{id}` `{"name":"Legal"}`  
Delete: `DELETE /api/folders/{id}`

### Step 11 — Small file (easiest first success)

File path: your PC → DMS → warehouse. Fine for a few MB.

```powershell
"Hello from Acme" | Out-File -Encoding utf8 .\hello.txt

curl.exe -s -X POST "$base/documents" `
  -H "x-tenant-id: $tenant" `
  -H "x-user-id: alice" `
  -H "x-user-name: Alice Kumar" `
  -H "x-roles: tenant_admin" `
  -F "file=@hello.txt" `
  -F "filename=hello.txt" `
  -F "name=Welcome note"
```

Add `-F "folderId=PASTE-FOLDER-ID"` to place it in a folder.

Copy `document.id`. Status should be `active`. If this works, identity, tenant, credentials, warehouse, and MySQL are all healthy.

### Step 12 — Large file (production path)

File path: your PC → warehouse. DMS only writes the index card.

**12.1 Create an upload session**

```powershell
curl.exe -s -X POST "$base/documents" `
  -H "content-type: application/json" `
  -H "x-tenant-id: $tenant" `
  -H "x-user-id: alice" `
  -H "x-roles: tenant_admin" `
  -H "idempotency-key: invoice-2026-08-19" `
  -d "{
    `"filename`": `"invoice.pdf`",
    `"mimeType`": `"application/pdf`",
    `"name`": `"August invoice`",
    `"size`": 123456
  }"
```

Save `document.id` and `upload.url`. Status is `pending_upload`.  
`Idempotency-Key`: same key twice → same document, no duplicate.

**12.2 PUT the file at that URL** (this hits MinIO/S3, not port 3000)

```powershell
curl.exe -s -X PUT "$uploadUrl" `
  -H "Content-Type: application/pdf" `
  --data-binary "@C:\Users\Public\invoice.pdf"
```

**12.3 Mark complete**

```powershell
curl.exe -s -X POST "$base/documents/$docId/upload" `
  -H "content-type: application/json" `
  -H "x-tenant-id: $tenant" `
  -H "x-user-id: alice" `
  -H "x-roles: tenant_admin" `
  -d "{}"
```

If you skipped 12.2 you get “upload has not reached storage”. PUT then retry. Safe to repeat.

### Step 13 — List, open, download, rename

```powershell
# list
curl.exe -s "$base/documents?q=invoice" `
  -H "x-tenant-id: $tenant" -H "x-user-id: alice" -H "x-roles: tenant_admin"

# one document
curl.exe -s "$base/documents/$docId" `
  -H "x-tenant-id: $tenant" -H "x-user-id: alice" -H "x-roles: tenant_admin"

# signed download link
curl.exe -s -X POST "$base/documents/$docId/download" `
  -H "content-type: application/json" `
  -H "x-tenant-id: $tenant" -H "x-user-id: alice" -H "x-roles: tenant_admin"

# stream through the API
curl.exe -L "$base/documents/$docId/content" `
  -H "x-tenant-id: $tenant" -H "x-user-id: alice" -H "x-roles: tenant_admin" `
  -o downloaded.txt

# rename
curl.exe -s -X PATCH "$base/documents/$docId" `
  -H "content-type: application/json" `
  -H "x-tenant-id: $tenant" -H "x-user-id: alice" -H "x-roles: tenant_admin" `
  -d "{`"name`":`"August invoice (signed)`"}"
```

### Step 14 — New version

```powershell
curl.exe -s -X POST "$base/documents/$docId/versions" `
  -H "x-tenant-id: $tenant" -H "x-user-id: alice" -H "x-roles: tenant_admin" `
  -F "file=@hello.txt" -F "filename=hello.txt"

curl.exe -s "$base/documents/$docId/versions" `
  -H "x-tenant-id: $tenant" -H "x-user-id: alice" -H "x-roles: tenant_admin"
```

Download an old copy: add `?versionNumber=1` to download or content.

### Step 15 — Share with Bob (read only)

```powershell
curl.exe -s -X POST "$base/documents/$docId/permissions" `
  -H "content-type: application/json" `
  -H "x-tenant-id: $tenant" -H "x-user-id: alice" -H "x-roles: tenant_admin" `
  -d "{
    `"principalType`": `"user`",
    `"principalId`": `"bob`",
    `"canRead`": true,
    `"canWrite`": false,
    `"canDelete`": false,
    `"canAdmin`": false
  }"
```

Bob uses `x-user-id: bob`. Another tenant can never see this id.

### Step 16 — Delete / restore / erase

```powershell
# recycle bin
curl.exe -s -X DELETE "$base/documents/$docId" `
  -H "x-tenant-id: $tenant" -H "x-user-id: alice" -H "x-roles: tenant_admin"

# restore
curl.exe -s -X POST "$base/documents/$docId/restore" `
  -H "x-tenant-id: $tenant" -H "x-user-id: alice" -H "x-roles: tenant_admin"

# also delete the warehouse object
curl.exe -s -X DELETE "$base/documents/${docId}?permanent=true" `
  -H "x-tenant-id: $tenant" -H "x-user-id: alice" -H "x-roles: tenant_admin"
```

---

## Part E — Journey picture

```
IT
  1. docker compose up -d
  2. npm run serve:express-dev
  3. POST /tenants
  4. Put TENANT_ACME_* in .env
  5. PUT  /tenants/{id}/storage     → s3 | minio | gcp | azure

Alice
  6. POST /folders
  7a. POST /documents + file        → small upload, done
      or
  7b. POST /documents (JSON)
      PUT  signed URL
      POST /documents/{id}/upload
  8. GET  /documents
  9. POST /documents/{id}/download
 10. POST /documents/{id}/versions
 11. POST /documents/{id}/permissions
 12. DELETE /documents/{id}
```

---

## Part F — Common mistakes

| You see | Cause | Fix |
|---|---|---|
| database down | MySQL not running | `docker compose up -d` |
| 401 Tenant id not found | Missing `x-tenant-id` | Add the UUID |
| 403 platform_admin required | Creating a tenant as a normal user | `x-roles: platform_admin` |
| no storage configuration | Skipped Step 8 | PUT storage first |
| missing accessKey | Env name mismatch, or Node not restarted | Names must match `.env` |
| upload has not reached storage | Completed before PUT | PUT, then complete again |
| MIME type not allowed | File type not on the tenant list | pdf / txt / png / jpeg, or change allow-list |
| Document not found | Wrong tenant, or in recycle bin | Same `x-tenant-id`; `?includeDeleted=true` |
| curl prints HTML help | Used `curl` not `curl.exe` | Always `curl.exe` |

---

## Security

- Users never receive AWS / Azure / Google passwords.
- They only get a signed URL that expires (~15 minutes).
- Tenants cannot see each other’s files, even with a guessed UUID.
- Do not put real keys in Git, chat, or the `storage_configs` table.

See also: [ONBOARDING.md](./ONBOARDING.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [sql/schema.sql](../sql/schema.sql).
