# API-key (headless) integration — drive the DMS entirely from your backend

> Companion to [user-service-integration.md](user-service-integration.md) (the
> browser / Keycloak path). Use this guide when the DMS is a **backend only**:
> another application of yours uploads files, creates folders and manages
> documents through the API, and the DMS web UI is either not used at all or used
> later by only a few administrators. It makes **no assumption about your user
> count** — a handful of users or thousands, the wiring is identical.

## The configuration this guide assumes

| Decision | Value | What it means in practice |
| --- | --- | --- |
| How your app authenticates | `x-api-key` | One machine key per environment; no logins, no cookies |
| Key role | `tenant_admin` (tenant-scoped) | The backend can read/edit/delete **any** document in the tenant |
| Per-user attribution | `x-user-id` on user-facing calls | Each document's `created_by` is recorded under the app user who caused it |
| Calling pattern | Mixed (same key, sometimes with `x-user-id`) | User-driven calls carry `x-user-id`; system/batch calls omit it |

**Read this before you build on it:** with a `tenant_admin` key, `x-user-id` is
**attribution only — it is *not* access isolation**. The key's role applies on
every call regardless of `x-user-id`, so your backend can operate on *any*
document in the tenant at any time. That is intentional and correct for a
trusted single backend: **your application** enforces any "user A may only see
user A's files" rule in its own logic *before* it calls the DMS. If you ever
need the DMS itself to wall users off from each other, see
[§9](#9-if-you-ever-need-true-per-user-isolation).

---

## 1. One-time setup (platform administrator)

API keys can only be created by a **platform administrator**, in the console at
`/admin/api-keys` (or `POST /api/api-keys`). The `tenant_admin` key itself
cannot mint further keys.

```bash
# Sign in once as a platform administrator (browser), then:
curl -s -X POST http://localhost:3000/api/api-keys \
  -H "Cookie: dms_at=$ADMIN_TOKEN" -H "x-dms-client: web" \
  -H "content-type: application/json" \
  -d '{
    "displayName": "acme app backend",
    "tenantId": "<tenant-uuid>",
    "roles": ["tenant_admin"]
  }'
# → { "apiKey": { ... }, "key": "dms_ab12cd34.x9yZ..." }   <-- shown EXACTLY ONCE
```

- Put `key` straight into your app's secret store / env (`DMS_API_KEY`). It is
  **never** retrievable again.
- Because the key is scoped to a tenant, you do **not** need to send
  `x-tenant-id` on every call (see §2). Issue a separate key per tenant if you
  ever serve more than one.

## 2. Headers every call sends

| Header | When | Notes |
| --- | --- | --- |
| `x-api-key: dms_...` | **always** | The only thing that authenticates the call |
| `x-user-id: <app-user>` | user-facing calls | Recorded as `created_by`; see §3 |
| `x-user-name: <name>` | optional, with `x-user-id` | Display name for audit / People page |
| `x-tenant-id: <uuid>` | optional | Defaults to the key's tenant; if sent, it is validated against the key |

Do **not** send `idtoken`, `Authorization: Bearer`, session cookies, or
`x-dms-client`. Those belong to the browser path; an API-key call ignores them,
and the `x-dms-client: web` CSRF check does not apply to API keys.

## 3. The two calling modes (your "Mixed" pattern)

Both modes use the **same key**. The only difference is whether you attribute
the action to an app user.

**Mode A — on behalf of an app user** (uploads/downloads triggered by a person
in your app). Send `x-user-id`. The document's `created_by` and owner become
that user.

```bash
curl -X POST http://localhost:3000/api/documents \
  -H "x-api-key: $DMS_API_KEY" \
  -H "x-user-id: app-user-4711" \
  -H "x-user-name: Asha Menon" \
  -H "content-type: application/json" \
  -d '{"filename":"invoice.pdf","name":"August invoice","mimeType":"application/pdf","size":1024}'
```

**Mode B — a system job** (batch import, maintenance, scheduled cleanup). Omit
`x-user-id`. Activity is recorded under the key's own identity
(`api-key:<prefix>`).

```bash
curl -X POST http://localhost:3000/api/documents \
  -H "x-api-key: $DMS_API_KEY" \
  -H "content-type: application/json" \
  -d '{"filename":"system-export.csv","name":"Nightly export"}'
```

In **both** modes the backend has full `tenant_admin` visibility — Mode B does
not see "less" than Mode A.

## 4. Upload a file

### Large file — goes straight to object storage (preferred)

The DMS never sees the bytes. Three steps:

```bash
# 1) Ask for an upload session (Idempotency-Key makes retries safe)
SESSION=$(curl -s -X POST http://localhost:3000/api/documents \
  -H "x-api-key: $DMS_API_KEY" \
  -H "x-user-id: app-user-4711" \
  -H "idempotency-key: invoice-2026-08-19" \
  -H "content-type: application/json" \
  -d '{"filename":"invoice.pdf","name":"August invoice","mimeType":"application/pdf","size":1024}')
DOCUMENT_ID=$(echo "$SESSION" | jq -r '.document.id')
UPLOAD_URL=$(echo "$SESSION" | jq -r '.upload.url')

# 2) PUT the bytes at the signed URL (vendor is invisible to the caller)
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: application/pdf" \
  --data-binary @invoice.pdf

# 3) Tell the DMS the object is present
curl -s -X POST "http://localhost:3000/api/documents/$DOCUMENT_ID/upload" \
  -H "x-api-key: $DMS_API_KEY" \
  -H "content-type: application/json" \
  -d '{"size":1024,"checksum":"<sha256-hex>"}'
```

Retrying step 1 with the same `Idempotency-Key` returns the original document —
no duplicate object. If `.upload` is `null` (a provider without presigned
uploads), use the one-call path below instead.

### Small file — through the API in one call

```bash
curl -X POST http://localhost:3000/api/documents \
  -H "x-api-key: $DMS_API_KEY" \
  -H "x-user-id: app-user-4711" \
  -F "file=@notes.txt" \
  -F "filename=notes.txt" \
  -F "name=Meeting notes"
```

Object layout in the bucket (the user segment is the `x-user-id` you sent):

```
<basePrefix>/<tenantId>/<app-user-id>/<documentId>/v<version>/<filename>
```

## 5. Folders

```bash
# create (optionally under a parent)
curl -X POST http://localhost:3000/api/folders \
  -H "x-api-key: $DMS_API_KEY" \
  -H "x-user-id: app-user-4711" \
  -H "content-type: application/json" \
  -d '{"name":"Contracts","parentId":null}'

# list (root: ?parentId=null ; a subfolder: ?parentId=<id>)
curl -s "http://localhost:3000/api/folders?parentId=null" -H "x-api-key: $DMS_API_KEY"

# rename
curl -X PATCH http://localhost:3000/api/folders/$FOLDER_ID \
  -H "x-api-key: $DMS_API_KEY" -H "content-type: application/json" -d '{"name":"Contracts 2026"}'

# before a recursive delete, see what it would trash
curl -s "http://localhost:3000/api/folders/$FOLDER_ID/summary" -H "x-api-key: $DMS_API_KEY"

# delete the folder and everything inside it (documents are moved to trash)
curl -X DELETE "http://localhost:3000/api/folders/$FOLDER_ID" -H "x-api-key: $DMS_API_KEY"
```

## 6. List, read, download, versions, delete, share

```bash
# list every document in the tenant (tenant_admin sees all)
curl -s "http://localhost:3000/api/documents" -H "x-api-key: $DMS_API_KEY"

# list just one app user's uploads
curl -s "http://localhost:3000/api/documents?createdBy=app-user-4711" -H "x-api-key: $DMS_API_KEY"

# get one (+ your effective access)
curl -s "http://localhost:3000/api/documents/$DOCUMENT_ID" -H "x-api-key: $DMS_API_KEY"

# download (short-lived signed URL), then fetch the bytes
curl -s -X POST "http://localhost:3000/api/documents/$DOCUMENT_ID/download" \
  -H "x-api-key: $DMS_API_KEY" | jq -r '.download.url' | xargs -I{} curl -L -O {}
#   or stream through the API:
curl -L "http://localhost:3000/api/documents/$DOCUMENT_ID/content" \
  -H "x-api-key: $DMS_API_KEY" -o invoice.pdf

# new version of an existing document — same session → PUT → complete flow as §4
curl -X POST "http://localhost:3000/api/documents/$DOCUMENT_ID/versions" \
  -H "x-api-key: $DMS_API_KEY" -H "idempotency-key: invoice-v2" \
  -H "content-type: application/json" -d '{"filename":"invoice.pdf"}'
#   → { document, upload:{url} }   PUT the bytes, then POST .../documents/$DOCUMENT_ID/upload
curl -s "http://localhost:3000/api/documents/$DOCUMENT_ID/versions" -H "x-api-key: $DMS_API_KEY"

# rename / move into a folder
curl -X PATCH "http://localhost:3000/api/documents/$DOCUMENT_ID" \
  -H "x-api-key: $DMS_API_KEY" -H "content-type: application/json" \
  -d '{"name":"Invoice Aug","folderId":"<folder-uuid>"}'

# soft delete → restore → permanent
curl -X DELETE "http://localhost:3000/api/documents/$DOCUMENT_ID" -H "x-api-key: $DMS_API_KEY"
curl -X POST   "http://localhost:3000/api/documents/$DOCUMENT_ID/restore" -H "x-api-key: $DMS_API_KEY"
curl -X DELETE "http://localhost:3000/api/documents/$DOCUMENT_ID?permanent=true" -H "x-api-key: $DMS_API_KEY"

# share with another app user (or a role)
curl -X POST "http://localhost:3000/api/documents/$DOCUMENT_ID/permissions" \
  -H "x-api-key: $DMS_API_KEY" -H "content-type: application/json" \
  -d '{"principalType":"user","principalId":"app-user-2200","level":"viewer"}'
curl -s   "http://localhost:3000/api/documents/$DOCUMENT_ID/permissions" -H "x-api-key: $DMS_API_KEY"
curl -X DELETE "http://localhost:3000/api/documents/$DOCUMENT_ID/permissions/$PERMISSION_ID" \
  -H "x-api-key: $DMS_API_KEY"
```

Access levels: `viewer` (read/download) · `contributor` (+ rename / new version) ·
`manager` (+ trash) · `owner` (+ share). Granting the same principal again
updates the existing grant instead of duplicating it.

## 7. What the key can also do (tenant administration, scoped to its tenant)

A tenant-scoped `tenant_admin` key may manage its **own** workspace — useful if
your app also provisions users or storage. It cannot create keys, suspend the
tenant, or touch other tenants; those need a platform administrator.

```bash
curl -s "http://localhost:3000/api/tenants/me" -H "x-api-key: $DMS_API_KEY"               # current tenant
curl -s "http://localhost:3000/api/tenants/$TENANT_ID/analytics" -H "x-api-key: $DMS_API_KEY"
curl -s "http://localhost:3000/api/tenants/$TENANT_ID/users" -H "x-api-key: $DMS_API_KEY"  # people
curl -X PUT "http://localhost:3000/api/tenants/$TENANT_ID/storage" -H "x-api-key: $DMS_API_KEY" \
  -H "content-type: application/json" -d '{ "provider": "s3", "container": "...", "region": "ap-south-1" }'
```

## 8. When an app user later needs the web UI

Most app users never will. When one does, attach their DMS account and **claim**
everything their old `x-user-id` created — it then appears in their member view
immediately:

```bash
curl -X POST "http://localhost:3000/api/tenants/$TENANT_ID/members" \
  -H "x-api-key: $DMS_API_KEY" -H "content-type: application/json" \
  -d '{"email":"asha.menon@acme.com","role":"member","claimAliases":["app-user-4711"]}'
# → { "member": { ... }, "claimed": { "documents": 3, "folders": 1, ... } }
```

If your app already used each person's email as `x-user-id`, claiming is
automatic — no `claimAliases` needed.

## 9. If you ever need true per-user isolation

If the requirement changes so that the **DMS itself** must stop one app user
reading another's files (for example, if the key is ever exposed beyond your
trusted backend), the `tenant_admin` key is the wrong choice. Switch to a
**`member`-scoped key**: each call's `x-user-id` then sees only its own +
explicitly-shared documents, enforced server-side. Trade-off: system / list-all
calls (Mode B) will only see documents attributed to the key identity, not other
users' files. A common pattern is **two keys** — a `member` key for per-user
on-behalf-of calls and a `tenant_admin` key for admin/batch jobs.

## 10. Pre-flight checklist

- [ ] Key created by a platform administrator; full secret stored in your secret manager (shown once).
- [ ] Every call carries `x-api-key`; no `idtoken` / cookie / `x-dms-client` for API traffic.
- [ ] `x-user-id` treated as **attribution**, not isolation — your app enforces per-user rules itself.
- [ ] `Idempotency-Key` sent on upload requests that may be retried.
- [ ] Tenant has a storage configuration before the first upload (otherwise uploads fail validation).
- [ ] Rotate by issuing a new key, switching the env var, then disabling the old one (`PATCH /api/api-keys/:id`).
