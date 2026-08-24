/**
 * Curated catalogue of DMS API operations used to render shareable, per-tenant
 * developer documentation.
 *
 * The catalogue is the single source of truth for the documentation *content*
 * (endpoints, headers, payloads, example responses). What a tenant actually sees
 * is decided by the platform administrator's selection, which is stored in the
 * `dms_tenant_docs` table. Examples use a clearly dummy API base and placeholder
 * secrets only — no real hosts, keys, tenant ids or user ids are ever embedded.
 *
 * The dummy host below is replaced with a tenant's configured API base URL when
 * the public documentation page is rendered (see TenantDocService).
 */
export const DOC_API_BASE_PLACEHOLDER = "https://dms.example.com/dms";

export type DocCategory = "Authentication" | "Documents" | "Folders" | "Versions" | "Sharing";

export const DOC_CATEGORIES: DocCategory[] = [
  "Authentication",
  "Documents",
  "Folders",
  "Versions",
  "Sharing",
];

export interface DocHeader {
  name: string;
  value: string;
  required?: boolean;
  description?: string;
}

export interface DocOperation {
  id: string;
  category: DocCategory;
  method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  path: string;
  title: string;
  summary: string;
  headers?: DocHeader[];
  /** Pretty-printed JSON request body, if the operation has one. */
  body?: string;
  /** A ready-to-run cURL command using the dummy base + placeholder secret. */
  curl: string;
  /** Pretty-printed example response. */
  response: string;
  notes?: string[];
}

/** Header set every machine-to-machine call carries. */
const API_KEY_HEADERS: DocHeader[] = [
  { name: "x-api-key", value: "dms_a1b2c3d4.<your-secret>", required: true, description: "Machine key issued by a platform administrator." },
  { name: "x-tenant-id", value: "<tenant-id>", required: false, description: "Optional when the key is scoped to one workspace." },
];

/** Header set carried when attributing an action to an application end user. */
const ON_BEHALF_OF_HEADERS: DocHeader[] = [
  ...API_KEY_HEADERS,
  { name: "x-user-id", value: "<user-id>", required: false, description: "Records this user as the document owner (created_by)." },
];

export const DOC_OPERATIONS: DocOperation[] = [
  {
    id: "auth.api-key",
    category: "Authentication",
    method: "POST",
    path: "/api/documents",
    title: "Authenticate with an API key",
    summary:
      "Send the API key in the x-api-key header on every call. The key fixes the workspace and role; x-user-id optionally attributes the action to one of your end users.",
    headers: ON_BEHALF_OF_HEADERS,
    curl: `curl -X POST ${DOC_API_BASE_PLACEHOLDER}/api/documents \\
  -H "x-api-key: dms_a1b2c3d4.<your-secret>" \\
  -H "x-tenant-id: <tenant-id>" \\
  -H "x-user-id: <user-id>" \\
  -H "content-type: application/json" \\
  -d '{"filename":"invoice.pdf","name":"August invoice"}'`,
    response: `{
  "document": {
    "id": "4d2d7e0a-...",
    "status": "pending_upload"
  }
}`,
    notes: [
      "Never embed the key in a browser. Calls are made server-to-server from your backend.",
      "Rotate a key by creating a new one, switching your secret, then disabling the old key.",
    ],
  },
  {
    id: "documents.createSession",
    category: "Documents",
    method: "POST",
    path: "/api/documents",
    title: "Create an upload session (large files)",
    summary:
      "Reserves a document and returns a signed URL so the file goes straight to object storage — the API never sees the bytes.",
    headers: ON_BEHALF_OF_HEADERS,
    body: `{
  "filename": "invoice.pdf",
  "name": "August invoice",
  "mimeType": "application/pdf",
  "size": 1024
}`,
    curl: `curl -X POST ${DOC_API_BASE_PLACEHOLDER}/api/documents \\
  -H "x-api-key: dms_a1b2c3d4.<your-secret>" \\
  -H "x-user-id: <user-id>" \\
  -H "idempotency-key: invoice-2026-08" \\
  -H "content-type: application/json" \\
  -d '{"filename":"invoice.pdf","name":"August invoice","mimeType":"application/pdf","size":1024}'`,
    response: `{
  "document": { "id": "4d2d7e0a-...", "status": "pending_upload" },
  "upload": { "url": "https://...signed...", "method": "PUT", "expiresAt": "2026-08-24T12:30:00.000Z" },
  "replayed": false
}`,
    notes: ["Retry with the same Idempotency-Key to get the original document back — no duplicate object."],
  },
  {
    id: "documents.complete",
    category: "Documents",
    method: "POST",
    path: "/api/documents/{id}/upload",
    title: "Confirm an upload",
    summary: "Called after the bytes have been PUT to the signed URL. Marks the document active and records the first version.",
    headers: API_KEY_HEADERS,
    body: `{ "size": 1024, "checksum": "<sha256-hex>" }`,
    curl: `curl -X POST ${DOC_API_BASE_PLACEHOLDER}/api/documents/4d2d7e0a.../upload \\
  -H "x-api-key: dms_a1b2c3d4.<your-secret>" \\
  -H "content-type: application/json" \\
  -d '{"size":1024,"checksum":"<sha256-hex>"}'`,
    response: `{ "document": { "id": "4d2d7e0a-...", "status": "active", "currentVersion": 1 } }`,
  },
  {
    id: "documents.uploadDirect",
    category: "Documents",
    method: "POST",
    path: "/api/documents",
    title: "Upload a small file in one call",
    summary: "For smaller files, send the bytes directly as multipart form data — no signed URL step.",
    headers: ON_BEHALF_OF_HEADERS,
    curl: `curl -X POST ${DOC_API_BASE_PLACEHOLDER}/api/documents \\
  -H "x-api-key: dms_a1b2c3d4.<your-secret>" \\
  -H "x-user-id: <user-id>" \\
  -F "file=@notes.txt" \\
  -F "filename=notes.txt" \\
  -F "name=Meeting notes"`,
    response: `{ "document": { "id": "4d2d7e0a-...", "status": "active", "size": 4200 } }`,
  },
  {
    id: "documents.list",
    category: "Documents",
    method: "GET",
    path: "/api/documents",
    title: "List documents",
    summary: "Returns documents in the workspace. Use the createdBy filter to list a specific user's uploads.",
    headers: API_KEY_HEADERS,
    curl: `curl "${DOC_API_BASE_PLACEHOLDER}/api/documents?limit=50&offset=0&createdBy=<user-id>" \\
  -H "x-api-key: dms_a1b2c3d4.<your-secret>"`,
    response: `{
  "documents": [
    { "id": "4d2d7e0a-...", "name": "August invoice", "status": "active" }
  ],
  "total": 1
}`,
  },
  {
    id: "documents.get",
    category: "Documents",
    method: "GET",
    path: "/api/documents/{id}",
    title: "Get a document",
    summary: "Returns the document metadata together with the caller's effective access level.",
    headers: API_KEY_HEADERS,
    curl: `curl "${DOC_API_BASE_PLACEHOLDER}/api/documents/4d2d7e0a..." \\
  -H "x-api-key: dms_a1b2c3d4.<your-secret>"`,
    response: `{
  "document": { "id": "4d2d7e0a-...", "name": "August invoice" },
  "access": { "level": "owner", "canRead": true, "canWrite": true }
}`,
  },
  {
    id: "documents.download",
    category: "Documents",
    method: "POST",
    path: "/api/documents/{id}/download",
    title: "Download a document",
    summary: "Returns a short-lived signed download URL. Fetch the bytes from the URL before it expires.",
    headers: API_KEY_HEADERS,
    body: `{ }`,
    curl: `curl -X POST ${DOC_API_BASE_PLACEHOLDER}/api/documents/4d2d7e0a.../download \\
  -H "x-api-key: dms_a1b2c3d4.<your-secret>" \\
  -H "content-type: application/json" \\
  -d '{}'`,
    response: `{
  "signedUrl": { "url": "https://...signed...", "expiresAt": "2026-08-24T12:45:00.000Z" },
  "download":  { "url": "https://...signed..." }
}`,
  },
  {
    id: "documents.rename",
    category: "Documents",
    method: "PATCH",
    path: "/api/documents/{id}",
    title: "Rename or move a document",
    summary: "Update the display name and optionally move the document into a folder.",
    headers: API_KEY_HEADERS,
    body: `{ "name": "Invoice August", "folderId": "<folder-id>" }`,
    curl: `curl -X PATCH ${DOC_API_BASE_PLACEHOLDER}/api/documents/4d2d7e0a... \\
  -H "x-api-key: dms_a1b2c3d4.<your-secret>" \\
  -H "content-type: application/json" \\
  -d '{"name":"Invoice August","folderId":"<folder-id>"}'`,
    response: `{ "document": { "id": "4d2d7e0a-...", "name": "Invoice August" } }`,
  },
  {
    id: "documents.delete",
    category: "Documents",
    method: "DELETE",
    path: "/api/documents/{id}",
    title: "Move to trash",
    summary: "Soft-deletes the document. It can be restored or permanently removed later.",
    headers: API_KEY_HEADERS,
    curl: `curl -X DELETE ${DOC_API_BASE_PLACEHOLDER}/api/documents/4d2d7e0a... \\
  -H "x-api-key: dms_a1b2c3d4.<your-secret>"`,
    response: `{ "document": { "id": "4d2d7e0a-...", "status": "soft_deleted" } }`,
  },
  {
    id: "documents.restore",
    category: "Documents",
    method: "POST",
    path: "/api/documents/{id}/restore",
    title: "Restore from trash",
    summary: "Restores a soft-deleted document back to active.",
    headers: API_KEY_HEADERS,
    body: `{ }`,
    curl: `curl -X POST ${DOC_API_BASE_PLACEHOLDER}/api/documents/4d2d7e0a.../restore \\
  -H "x-api-key: dms_a1b2c3d4.<your-secret>" \\
  -H "content-type: application/json" \\
  -d '{}'`,
    response: `{ "document": { "id": "4d2d7e0a-...", "status": "active" } }`,
  },
  {
    id: "folders.create",
    category: "Folders",
    method: "POST",
    path: "/api/folders",
    title: "Create a folder",
    summary: "Creates a folder, optionally nested under a parent folder.",
    headers: ON_BEHALF_OF_HEADERS,
    body: `{ "name": "Contracts", "parentId": null }`,
    curl: `curl -X POST ${DOC_API_BASE_PLACEHOLDER}/api/folders \\
  -H "x-api-key: dms_a1b2c3d4.<your-secret>" \\
  -H "x-user-id: <user-id>" \\
  -H "content-type: application/json" \\
  -d '{"name":"Contracts","parentId":null}'`,
    response: `{ "folder": { "id": "f1c2b3a4-...", "name": "Contracts" } }`,
  },
  {
    id: "folders.list",
    category: "Folders",
    method: "GET",
    path: "/api/folders",
    title: "List folders",
    summary: "Returns folders under a parent. Use parentId=null for the root level.",
    headers: API_KEY_HEADERS,
    curl: `curl "${DOC_API_BASE_PLACEHOLDER}/api/folders?parentId=null" \\
  -H "x-api-key: dms_a1b2c3d4.<your-secret>"`,
    response: `{ "folders": [{ "id": "f1c2b3a4-...", "name": "Contracts" }] }`,
  },
  {
    id: "folders.summary",
    category: "Folders",
    method: "GET",
    path: "/api/folders/{id}/summary",
    title: "Folder deletion summary",
    summary: "Shows what a recursive folder delete would affect, for a confirmation step.",
    headers: API_KEY_HEADERS,
    curl: `curl "${DOC_API_BASE_PLACEHOLDER}/api/folders/f1c2b3a4.../summary" \\
  -H "x-api-key: dms_a1b2c3d4.<your-secret>"`,
    response: `{ "folder": { "id": "f1c2b3a4-..." }, "folders": 2, "documents": 7, "bytes": 1048576 }`,
  },
  {
    id: "folders.delete",
    category: "Folders",
    method: "DELETE",
    path: "/api/folders/{id}",
    title: "Delete a folder",
    summary: "Deletes the folder, its sub-folders and their documents in one operation (documents move to trash).",
    headers: API_KEY_HEADERS,
    curl: `curl -X DELETE ${DOC_API_BASE_PLACEHOLDER}/api/folders/f1c2b3a4... \\
  -H "x-api-key: dms_a1b2c3d4.<your-secret>"`,
    response: `{ "folder": { "id": "f1c2b3a4-..." }, "deleted": { "folders": 2, "documents": 7, "bytes": 1048576 } }`,
  },
  {
    id: "versions.create",
    category: "Versions",
    method: "POST",
    path: "/api/documents/{id}/versions",
    title: "Upload a new version",
    summary: "Starts a new version of an existing document using the same session → PUT → confirm flow as an upload.",
    headers: API_KEY_HEADERS,
    body: `{ "filename": "invoice.pdf" }`,
    curl: `curl -X POST ${DOC_API_BASE_PLACEHOLDER}/api/documents/4d2d7e0a.../versions \\
  -H "x-api-key: dms_a1b2c3d4.<your-secret>" \\
  -H "idempotency-key: invoice-v2" \\
  -H "content-type: application/json" \\
  -d '{"filename":"invoice.pdf"}'`,
    response: `{ "document": { "id": "4d2d7e0a-...", "currentVersion": 2 }, "upload": { "url": "https://...signed..." } }`,
  },
  {
    id: "versions.list",
    category: "Versions",
    method: "GET",
    path: "/api/documents/{id}/versions",
    title: "List versions",
    summary: "Returns the full version history of a document.",
    headers: API_KEY_HEADERS,
    curl: `curl "${DOC_API_BASE_PLACEHOLDER}/api/documents/4d2d7e0a.../versions" \\
  -H "x-api-key: dms_a1b2c3d4.<your-secret>"`,
    response: `{
  "versions": [{ "versionNumber": 1, "size": 1024 }, { "versionNumber": 2, "size": 1280 }]
}`,
  },
  {
    id: "sharing.grant",
    category: "Sharing",
    method: "POST",
    path: "/api/documents/{id}/permissions",
    title: "Share a document",
    summary: "Grants access to a user or a role at one level: viewer, contributor, manager or owner.",
    headers: API_KEY_HEADERS,
    body: `{ "principalType": "user", "principalId": "<user-id>", "level": "viewer" }`,
    curl: `curl -X POST ${DOC_API_BASE_PLACEHOLDER}/api/documents/4d2d7e0a.../permissions \\
  -H "x-api-key: dms_a1b2c3d4.<your-secret>" \\
  -H "content-type: application/json" \\
  -d '{"principalType":"user","principalId":"<user-id>","level":"viewer"}'`,
    response: `{ "permission": { "principalType": "user", "principalId": "<user-id>", "level": "viewer" } }`,
    notes: ["Granting the same principal again updates the existing grant instead of duplicating it."],
  },
  {
    id: "sharing.list",
    category: "Sharing",
    method: "GET",
    path: "/api/documents/{id}/permissions",
    title: "List document access",
    summary: "Returns the grants on a document plus the caller's effective access and the available levels.",
    headers: API_KEY_HEADERS,
    curl: `curl "${DOC_API_BASE_PLACEHOLDER}/api/documents/4d2d7e0a.../permissions" \\
  -H "x-api-key: dms_a1b2c3d4.<your-secret>"`,
    response: `{
  "permissions": [{ "principalType": "user", "principalId": "<user-id>", "level": "viewer" }],
  "access": { "level": "owner" }
}`,
  },
];

const OPERATION_IDS = new Set(DOC_OPERATIONS.map((operation) => operation.id));

/** Default selection shown when a platform administrator first opens the builder. */
export const DEFAULT_DOC_OPERATION_IDS: string[] = [
  "auth.api-key",
  "documents.createSession",
  "documents.complete",
  "documents.uploadDirect",
  "documents.list",
  "documents.get",
  "documents.download",
  "folders.create",
  "folders.list",
  "sharing.grant",
];

/** Lightweight entries the builder UI renders as a checklist. */
export interface DocOperationSummary {
  id: string;
  category: DocCategory;
  method: DocOperation["method"];
  path: string;
  title: string;
  summary: string;
}

export const DOC_OPERATION_SUMMARIES: DocOperationSummary[] = DOC_OPERATIONS.map(
  ({ id, category, method, path, title, summary }) => ({ id, category, method, path, title, summary })
);

/** True when the id exists in the catalogue. */
export function isKnownOperation(id: string): boolean {
  return OPERATION_IDS.has(id);
}

/** Full operations for a selection, grouped and ordered by category. */
export function resolveOperations(ids: string[]): DocOperation[] {
  const wanted = new Set(ids);
  return DOC_OPERATIONS.filter((operation) => wanted.has(operation.id));
}
