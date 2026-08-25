# Folder maps — tenant-defined document taxonomy

Each workspace can define its own **folder maps**: named path templates that its
applications reference instead of folder ids. The DMS never decides the taxonomy;
it only stores each tenant's templates, resolves them safely, and creates the
folders on demand.

```
Root (workspace: sify-forms)
├── submissions/           ← respondent file uploads
│   └── {orgId}/{formId}/
├── support-documents/     ← builder-attached reference docs
│   └── {orgId}/{formId}/
├── branding/              ← logo images
│   └── {orgId}/
└── signatures/            ← signature captures (future)
    └── {orgId}/{formId}/
```

Another workspace may use a completely different scheme
(`invoices/{clientCode}/{year}`) — nothing is hardcoded in the DMS.

---

## 1. One-time setup

Workspace administrators define the set of maps in **Settings → Folder maps**
(the UI shows a live preview and a copy-paste upload snippet), or via the API:

```bash
curl -X PUT https://<host>/dms/api/folders/maps \
  -H "x-api-key: <your-secret>" \
  -H "content-type: application/json" \
  -d '{"maps": [
        {"key":"submissions",       "pathTemplate":"submissions/{orgId}/{formId}"},
        {"key":"support-documents", "pathTemplate":"support-documents/{orgId}/{formId}"},
        {"key":"branding",          "pathTemplate":"branding/{orgId}"},
        {"key":"signatures",        "pathTemplate":"signatures/{orgId}/{formId}", "status":"disabled"}
      ]}'
```

Rules (enforced by the DMS):

| Rule | Value |
| --- | --- |
| Map key | lowercase letters, numbers, `-`, `_` — 1–100 chars |
| Template depth | max 16 levels |
| Segment | a literal folder name **or** exactly one `{placeholder}` |
| Placeholder name | letters, numbers, `-`, `_` — 1–64 chars |
| Disabled maps | stored but never resolved |

A `PUT` replaces the whole set — send all maps every time.

## 2. Filing documents (the one-call pattern)

```bash
curl -X POST https://<host>/dms/api/documents \
  -H "x-api-key: <your-secret>" \
  -H "x-user-id: <user-id>" \
  -H "content-type: application/json" \
  -d '{
        "filename": "response-4821.pdf",
        "folderMap": "submissions",
        "folderVars": { "orgId": "org-123", "formId": "form-456" },
        "metadata":  { "orgId": "org-123", "formId": "form-456" }
      }'
```

The DMS resolves the template, **creates every missing folder idempotently**, and
files the document. `folderId` (as before) and raw `folderPath`
(`"submissions/org-123/form-456"`) remain available and are mutually exclusive
with `folderMap`.

Ensure a path explicitly (also idempotent — safe under retries and concurrency):

```bash
curl -X POST https://<host>/dms/api/folders/ensure \
  -H "x-api-key: <your-secret>" -H "content-type: application/json" \
  -d '{"path":"submissions/org-123/form-456"}'
# → { "folder": { "id": "…", "path": "/submissions/org-123/form-456" }, "created": true }
```

## 3. Accessing the contents

```bash
# by path (one call)
curl "https://<host>/dms/api/documents?path=/submissions/org-123/form-456" -H "x-api-key: …"

# by metadata (cross-cutting: every org's submissions for one form)
curl "https://<host>/dms/api/documents?metadata.formId=form-456" -H "x-api-key: …"

# by metadata + folder
curl "https://<host>/dms/api/documents?path=/submissions&metadata.orgId=org-123" -H "x-api-key: …"
```

Metadata filters are exact-match, combine with each other and with folder/path
scoping, and always apply **inside** the caller's visibility scope (members see
only their own + shared documents; they narrow, never widen). Read-only path
lookup: `GET /api/folders/resolve?path=/submissions/org-123`.

## 4. Security model

1. **Validation** — every path segment and every variable value must be a single
   valid segment: no empty, `.`, `..`, `/` or control characters; depth ≤ 16,
   length ≤ 255. A variable can never inject extra hierarchy levels.
2. **Tenant isolation** — every ensure/resolve/list query is tenant-scoped; a
   crafted path or map can only address folders inside the caller's own
   workspace.
3. **No storage exposure** — paths are database metadata; object keys stay
   `<basePrefix>/<tenantId>/<userId>/<documentId>/v<n>/<filename>` regardless of
   folder structure. There is no bucket-traversal surface.
4. **Race-safe idempotency** — the `UNIQUE (tenant_id, parent_id, name)` key
   guarantees concurrent ensures converge on one folder; a loser of the race
   re-reads instead of duplicating.
5. **Permissions unchanged** — filing location never grants access; document
   access still resolves per principal (creator, grants, tenant admin).
6. **Administration** — maps are read by every workspace member (their apps need
   them) but written only by workspace/platform administrators.

## 5. Where things live

| Piece | Location |
| --- | --- |
| Table | `dms_folder_maps` (see `sql/migrations/2026_08_folder_maps.sql`) |
| Validation | `src/service/folderPaths.ts` |
| Services | `src/service/folderMapService.ts`, `FolderService.ensurePath` |
| Routes | `GET/PUT /api/folders/maps`, `POST /api/folders/ensure`, `GET /api/folders/resolve` |
| UI | Workspace **Settings → Folder maps** |
| Interactive docs | `GET /api/documents` (`path`, `metadata.*`), `POST /documents` (`folderMap`/`folderPath`) |

**Scaling note:** metadata filters use exact-match JSON path lookups on the
`metadata_json` column. At very large scale, add MySQL generated columns (or a
flat tag table) for the hot keys — the API contract does not change.
