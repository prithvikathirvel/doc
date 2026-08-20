# DMS Production Readiness: Risks, Bottlenecks, and Real-World Challenges

This document captures what this Document Management System (DMS) should expect in production, where the current implementation may become a bottleneck, and how mature document platforms handle those issues.

It also documents the new preview-signed-URL API added for browser-friendly file preview.

---

## 1. Preview API

### 1.1 New API

```http
POST /api/documents/{documentId}/preview
```

Optional request body:

```json
{
  "versionNumber": 2
}
```

Example response:

```json
{
  "document": {
    "id": "doc-123",
    "name": "Contract",
    "mimeType": "application/pdf",
    "originalFilename": "contract.pdf"
  },
  "version": null,
  "signedUrl": {
    "url": "https://bucket.s3.amazonaws.com/tenant/doc/v1/contract.pdf?X-Amz-...",
    "method": "GET",
    "expiresAt": "2026-08-20T13:40:00.000Z"
  },
  "previewable": true,
  "disposition": "inline"
}
```

The signed URL points directly to object storage and uses:

- `Content-Type` equal to the document MIME type.
- `Content-Disposition: inline; filename="..."`.
- Short TTL from tenant storage configuration.

The browser can then render supported files directly:

- PDF: `application/pdf`
- Images: `image/*`
- Video: `video/*`
- Audio: `audio/*`
- Text: `text/plain`, `text/csv`, `text/html`

Unsupported binary types may still return a URL, but the UI shows a “Preview not available” state and recommends download.

### 1.2 API-proxied preview fallback

The existing content endpoint now accepts inline disposition:

```http
GET /api/documents/{documentId}/content?disposition=inline
GET /api/documents/{documentId}/content?versionNumber=2&disposition=inline
```

This is useful when a provider cannot issue signed URLs, but it streams bytes through the API and should be avoided for large files at scale.

### 1.3 Storage CORS requirement

Because the browser loads the signed URL directly from S3, GCS, Azure, or MinIO, the storage bucket must allow the web origin.

Example S3 CORS configuration:

```json
[
  {
    "AllowedOrigins": ["https://dms.example.com"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Type", "Content-Length", "Content-Disposition"],
    "MaxAgeSeconds": 3000
  }
]
```

Without CORS, preview of PDF/text/video in an iframe may fail even though the signed URL itself is valid.

---

## 2. Storage and database consistency

### 2.1 Orphan records when files are deleted directly from storage

Example scenario:

1. A tenant uploads 1,000 documents.
2. An engineer, lifecycle rule, or external script deletes objects directly from S3.
3. The MySQL database still contains document rows.
4. The React UI still lists those documents.
5. A user clicks preview or download.

Current behavior after the preview fix:

- The preview API checks whether the object exists before issuing a signed URL.
- If the object is missing, it returns `404 STORAGE_NOT_FOUND`.
- The UI shows “Preview unavailable” instead of opening a broken storage URL.

That is correct behavior, but it is only a symptom treatment. Production systems need drift detection and reconciliation.

### 2.2 Industry approach

Mature DMS platforms treat the database as the source of truth for metadata while treating object storage as immutable content. They usually add:

- A reconciliation job that compares DB records against storage objects.
- A document status such as `active`, `pending_upload`, `failed`, `missing_in_storage`, or `quarantined`.
- Storage event notifications from S3, GCS, Azure, or MinIO.
- Audit events for every storage inconsistency.
- A “report missing file” action in the UI.
- Optional automatic repair from backup/versioning.

Recommended reconciliation flow:

1. Query active documents in batches by tenant.
2. For each object key, call `HEAD`/`exists` or use storage inventory reports.
3. If missing, mark the document as `missing_in_storage` or store `metadata.storageMissing = true`.
4. Emit an audit event and operator metric.
5. Show a clear UI state: “File content is unavailable. It may have been deleted outside DMS.”
6. Do not silently delete the DB row; the business may need evidence of the missing file.

### 2.3 Why not delete the row automatically?

The metadata may be required for audit, legal hold, billing, or investigation. If a file disappears, the organization needs to know:

- Who uploaded it.
- When it was uploaded.
- Who had access.
- When storage stopped returning it.
- Whether deletion was authorized.

A tombstone or missing-object status is safer than deleting metadata.

---

## 3. Large files and memory pressure

### 3.1 Current bottleneck

The backend uses `multer.memoryStorage()` for direct upload and direct version upload. That means uploaded bytes are buffered in API memory before being sent to storage.

This is fine for small dev files, but dangerous in production because:

- Multiple 100 MB uploads can exhaust Node.js memory.
- API pods cannot scale horizontally as efficiently.
- Slow clients keep request memory alive longer.
- Backpressure and retry behavior are harder.

### 3.2 Recommended approach

For larger files:

1. Create a document row with status `pending_upload`.
2. Generate a resumable or multipart signed upload URL.
3. Upload directly from browser to storage.
4. Complete the multipart upload.
5. Call the DMS API to verify the object and activate the document.

For very large files:

- Use S3 multipart uploads.
- Use GCS resumable uploads.
- Use Azure block blob uploads.
- Set part size based on file size.
- Abort stale incomplete multipart uploads with lifecycle rules.

The current code has multipart interfaces for S3 and MinIO, but the browser flow does not yet use them end-to-end.

---

## 4. Signed URL TTL, expiry, and refresh

### 4.1 Problem

Signed URLs expire. If a user opens a document page, leaves it open for two hours, then clicks preview, the URL may have expired.

### 4.2 Recommended approach

- Use short TTLs, for example 5–15 minutes.
- Request a fresh preview URL when the user clicks Preview, not on page load.
- Return `expiresAt` to the client.
- Refresh automatically when a URL is close to expiry.
- Do not persist signed URLs in the database.
- Log signed URL creation, but never log the full URL because it contains credentials.

The implementation now creates the preview URL when the user opens preview, which is the safest pattern.

---

## 5. Preview limitations

### 5.1 Browser-native preview is limited

Browsers reliably preview only certain file types:

- PDF
- Images
- Plain text/CSV
- HTML, with sandboxing
- Some audio/video formats

They do not natively preview:

- Microsoft Word
- Excel
- PowerPoint
- CAD files
- ZIP archives
- Many proprietary formats
- Password-protected PDFs
- Corrupted files

### 5.2 Production options

For richer preview:

- Convert documents to PDF or HTML asynchronously.
- Generate thumbnails and page images.
- Use LibreOffice in a worker, only with sandboxing and resource limits.
- Use a dedicated service such as OnlyOffice, Collabora, Crocodoc-style rendering, or a cloud document viewer.
- Store preview artifacts separately, for example under a `previews/` prefix.
- Track preview generation status: `pending`, `ready`, `unsupported`, `failed`.

Do not perform conversion inside the request path. It is CPU-heavy and can block the API.

---

## 6. Security and tenant isolation

### 6.1 Signed URL leakage

A signed URL gives time-limited access to the object without further API checks. Risks:

- Shared in screenshots, chat, logs, or browser history.
- Used after a user loses access, until expiry.
- Bookmarked by a browser proxy.

Mitigations:

- Keep TTL short.
- Use least-privilege storage credentials.
- Allow only required bucket prefixes.
- Use `GET` only for preview/download URLs.
- Never log full signed URLs.
- For sensitive files, route through an authorization layer or use CDN signed URLs with revocation.
- Consider IP/referrer constraints where supported, though these can be fragile.

### 6.2 IDOR and tenant checks

The service checks document access before issuing preview/download URLs. That is critical. In production, every object path must remain tied to:

- `tenantId`
- `documentId`
- user/role permissions
- storage provider configuration

The object key should never be accepted from the client for read/write operations. The backend should derive it from the authorized document record.

### 6.3 Malware and content safety

Users upload untrusted files. Production DMS should include:

- Antivirus or cloud scanner, for example ClamAV, BucketAV, or cloud malware scanning.
- A `quarantined` status.
- No preview/download until scanning passes for strict tenants.
- Content sniffing hardening: correct `Content-Type`, `X-Content-Type-Options: nosniff`.
- Sandboxed iframe for HTML/SVG.
- Disallow active content where possible.

The service already has a `FileScanHook` interface, but production needs an actual scanner implementation and async handling.

---

## 7. Quotas, rate limiting, and abuse

Without controls, one tenant can consume too much:

- Storage bytes
- Request count
- Upload bandwidth
- Preview bandwidth
- API CPU for conversion
- Number of documents or versions

Recommended controls:

- Enforce tenant storage quotas.
- Track active bytes, version bytes, and trash bytes.
- Rate-limit upload, preview, and download endpoints.
- Limit maximum file size and MIME type, which the code already starts doing.
- Add per-user and per-tenant rate limits.
- Alert when tenants approach quota.
- Reject uploads early before storing bytes when possible.

---

## 8. Database scalability

### 8.1 Pagination and table scans

Current list APIs support `limit` and `offset`, which is acceptable for small tenants. At high volume:

- Deep offset pagination becomes slow.
- Search without a full-text index causes scans.
- Counting total rows on every query becomes expensive.

Recommended:

- Use keyset/cursor pagination for large lists.
- Add indexes on `(tenant_id, folder_id, deleted_at, created_at)`.
- Add indexes for permissions by principal.
- Use full-text search or OpenSearch/Elasticsearch for document search.
- Cache or approximate totals where exact counts are unnecessary.

### 8.2 N+1 queries and analytics

Tenant/user analytics may aggregate many rows. For large datasets:

- Precompute daily rollups.
- Increment counters on document lifecycle events where appropriate.
- Use periodic batch jobs.
- Move heavy reporting to read replicas.
- Add metrics retention windows.

### 8.3 Connection pool sizing

The API uses MySQL. Under load:

- Too many connections can overload MySQL.
- Serverless pods can create connection storms.
- Slow queries can exhaust the pool.

Mitigations:

- Tune pool size based on instance capacity.
- Use a connection proxy such as RDS Proxy or ProxySQL for serverless deployments.
- Set statement timeouts.
- Monitor slow queries.

---

## 9. Object storage lifecycle and cost

### 9.1 Versions increase storage cost

Every version is an immutable object. Over time, old versions dominate cost.

Recommended lifecycle policies:

- Move old non-current versions to cheaper storage after N days.
- Expire delete markers and incomplete multipart uploads.
- Allow per-tenant retention policies.
- Enforce legal hold before deleting anything.
- Provide “delete all versions” only to authorized admins with confirmation.

### 9.2 Trash is not deletion

Soft-deleted documents remain in storage. Production should:

- Show trash size to admins.
- Permanently delete after a configurable retention window.
- Emit warnings before automatic purge.
- Preserve audit records after storage deletion.

---

## 10. Background jobs and retries

The current implementation is mostly request-driven. Production needs workers for:

- Virus scanning.
- Thumbnail/PDF preview generation.
- Reconciliation.
- Trash purge.
- Quota recalculation.
- Webhook delivery.
- Audit export.
- Storage migration between providers.

Rules:

- Jobs must be idempotent.
- Use bounded retries with backoff.
- Move messages to dead-letter queues after repeated failure.
- Track job status per document.
- Never block the main upload/preview request on slow worker work.

---

## 11. Observability

At minimum, production should track:

- Upload success/failure rate and latency.
- Preview/download success rate and latency.
- Signed URL creation failures.
- Storage provider errors by tenant and provider.
- DB query latency and pool saturation.
- Number of `pending_upload`, `failed`, and `missing_in_storage` documents.
- Storage bytes per tenant.
- Audit delivery failures.
- API 4xx/5xx rates by route.

Each storage error should preserve:

- Tenant ID
- Document ID
- Provider
- Operation
- Storage error code
- Correlation/request ID

Do not log secrets, credentials, or full signed URLs.

---

## 12. Compliance and audit

DMS products often need:

- Immutable audit logs.
- Legal hold.
- Retention schedules.
- Export of audit history.
- Access reviews.
- Per-document permission history.
- E-discovery support.
- Data residency controls.

Recommended additions:

- Append-only audit storage or external SIEM.
- Retention policy per tenant.
- Legal hold flag that overrides deletion.
- Reason field for admin downloads and access changes.
- Hash/checksum verification for documents.

---

## 13. Multi-region and high availability

For business-critical DMS:

- Deploy the API across multiple AZs.
- Use managed storage with versioning and replication.
- Replicate database backups across regions.
- Define RTO/RPO.
- Test restore procedures.
- Ensure signed URL endpoint matches the region closest to users.
- Consider CDN distribution for approved large-file downloads.

Storage migration between providers or regions should be asynchronous and verifiable. It should not require changing every object key at once.

---

## 14. Frontend production concerns

### 14.1 Handling missing storage gracefully

The React app should distinguish:

- Loading
- No access
- Deleted
- Pending upload
- Failed upload
- Missing in storage
- Unsupported preview
- Expired signed URL

Instead of a generic “file not found,” show actionable messages.

### 14.2 Avoid using object URLs for authorization

Preview and download URLs are time-limited. The UI should:

- Request URLs when needed.
- Discard URLs after use.
- Retry with a fresh URL after expiry.
- Never store URLs in localStorage.

### 14.3 Large lists

For thousands of documents:

- Use virtualized tables where appropriate.
- Fetch pages, not the whole tenant.
- Cancel stale requests when filters change.
- Debounce search.
- Preserve tab state in the URL where useful.

---

## 15. Operational migration and backward compatibility

The preview feature was added without removing existing download behavior:

- `POST /documents/{id}/download` continues to return `download`.
- It also returns `signedUrl` for a consistent field name.
- `GET /documents/{id}/content` remains available.
- `GET /documents/{id}/content?disposition=inline` is added for API-proxied preview.

This allows existing clients to keep working while new clients adopt preview.

---

## 16. Good points already present in the project

The current codebase already has several strong production-oriented foundations:

1. **Multi-tenant object key layout**
   - Keys include tenant, user, document, version, and filename segments.
   - This supports tenant isolation, prefix policies, and lifecycle rules.

2. **Provider abstraction**
   - S3, MinIO, GCP, and Azure share a common storage interface.
   - Adding a provider or behavior does not require rewriting document logic.

3. **Signed upload and download support**
   - The service can keep the API out of the byte path, which is important for scale.

4. **Document versions**
   - Versions are modeled separately and stored as immutable objects.

5. **Permission model**
   - Viewer, contributor, manager, and owner levels map well to real DMS workflows.

6. **Audit and metrics hooks**
   - Upload/download operations already record audit events and metrics.

7. **Storage configuration per tenant**
   - Each tenant can use a different bucket, provider, prefix, and signed URL TTL.

8. **Soft delete and restore**
   - Accidental deletion can be reversed without immediate storage loss.

9. **Checksums**
   - Direct uploads calculate SHA-256 checksums, which supports integrity verification.

10. **Idempotency support for upload sessions**
    - Replaying an idempotent upload can return the existing document instead of creating duplicates.

11. **Clear separation between metadata and content**
    - MySQL stores metadata; object storage stores bytes.

12. **File type and size validation**
    - Allowed MIME types and max size are enforced per tenant.

13. **Scanner interface**
    - A `FileScanHook` is already present and can be wired to a production malware scanner.

14. **Operational errors are categorized**
    - Storage not found, permission, timeout, configuration, and capability errors are distinguishable.

15. **UI shell and route structure**
    - The frontend is organized around admin, tenant workspace, documents, users, and settings.

---

## 17. Recommended next priorities

If this project moves toward production, the highest-value next steps are:

1. Add a storage reconciliation worker and missing-object status.
2. Move large uploads to multipart/resumable direct-to-storage uploads.
3. Add malware scanning and quarantine states.
4. Add CORS and signed URL tests for all storage providers.
5. Add async preview rendering for Office and unsupported formats.
6. Replace deep-offset pagination with cursor pagination for large lists.
7. Add quota enforcement and usage alerts.
8. Add retention, legal hold, and trash purge jobs.
9. Add structured dashboards and alerts for storage/provider failures.
10. Test backup/restore and multi-AZ failure scenarios.
