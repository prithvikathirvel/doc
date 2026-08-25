/**
 * Spec-driven documentation catalogue.
 *
 * The structure of every documented operation — its method, path, parameters
 * and request body (including which fields are required) — is read directly from
 * the live OpenAPI document (`swaggerSpec` in src/swagger.ts). That document is
 * generated from the same code the API runs, so the documentation can never
 * drift from the real contract: rename or remove an endpoint and it disappears
 * here; add a parameter and it shows up automatically.
 *
 * Only a small curated overlay (`OPERATION_META`) is maintained by hand — the
 * human touches the spec cannot provide: a friendly title, the category, short
 * notes and a concise example response. To document a new endpoint, add one
 * entry to `OPERATION_META`; the rest is derived from the spec.
 */
import { swaggerSpec } from "../swagger";

export const DOC_API_BASE_PLACEHOLDER = "https://dms.example.com/dms";

export type DocCategory = "Documents" | "Folders" | "Sharing";

export const DOC_CATEGORIES: DocCategory[] = ["Documents", "Folders", "Sharing"];

export interface DocHeader {
  name: string;
  value: string;
  required?: boolean;
  description?: string;
}

export interface DocField {
  name: string;
  location: "path" | "query" | "body";
  type: string;
  required: boolean;
  description?: string;
  example?: string;
}

export interface DocOperation {
  id: string;
  category: DocCategory;
  method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  /** API-relative path, e.g. /documents/{id}. The full URL is built by the service. */
  path: string;
  title: string;
  summary: string;
  auth: DocHeader[];
  parameters: DocField[];
  bodyFields?: DocField[];
  bodyExample?: string;
  responseExample: string;
  notes?: string[];
}

export interface DocOperationSummary {
  id: string;
  category: DocCategory;
  method: DocOperation["method"];
  path: string;
  title: string;
  summary: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type SpecDocument = { paths: Record<string, Record<string, any>>; components?: { schemas?: Record<string, any> } };
const spec = swaggerSpec as unknown as SpecDocument;

/* ── Authentication header presets (not per-operation in the spec) ────────── */

const API_KEY_HEADER: DocHeader = {
  name: "x-api-key",
  value: "dms_a1b2c3d4.<your-secret>",
  required: true,
  description: "Machine key issued by a platform administrator. Always required.",
};

const AUTH_HEADERS: Record<"apikey" | "onbehalf" | "none", DocHeader[]> = {
  none: [],
  apikey: [
    API_KEY_HEADER,
    {
      name: "x-tenant-id",
      value: "<tenant-id>",
      description: "Selects the workspace. Optional when the key is scoped to one workspace.",
    },
  ],
  onbehalf: [
    API_KEY_HEADER,
    {
      name: "x-user-id",
      value: "<user-id>",
      description: "Attributes the action to one of your end users (recorded as created_by).",
    },
    {
      name: "x-tenant-id",
      value: "<tenant-id>",
      description: "Selects the workspace. Optional when the key is scoped to one workspace.",
    },
  ],
};

/* ── Curated overlay. Keyed by "METHOD /path" exactly as in the spec. ─────── */

interface OperationMeta {
  category: DocCategory;
  title?: string;
  summary?: string;
  auth?: "apikey" | "onbehalf" | "none";
  notes?: string[];
  responseExample: string;
}

const OPERATION_META: Record<string, OperationMeta> = {
  "POST /documents": {
    category: "Documents",
    auth: "onbehalf",
    title: "Upload a document",
    summary: "Create an upload session (JSON) for a signed URL, or upload a small file directly (multipart).",
    notes: ["Retry the JSON request with the same Idempotency-Key to get the original document back — no duplicate."],
    responseExample: `{
  "document": { "id": "4d2d7e0a-...", "status": "pending_upload" },
  "upload": { "url": "https://...signed...", "method": "PUT", "expiresAt": "2026-08-24T12:30:00.000Z" },
  "replayed": false
}`,
  },
  "POST /documents/{id}/upload": {
    category: "Documents",
    auth: "apikey",
    title: "Confirm an upload",
    summary: "Call after PUTting the bytes to the signed URL. Marks the document active and records the first version.",
    responseExample: `{ "document": { "id": "4d2d7e0a-...", "status": "active", "currentVersion": 1 } }`,
  },
  "GET /documents": {
    category: "Documents",
    auth: "apikey",
    title: "List documents",
    summary: "Returns documents in the workspace. Filter with createdBy to list one user's uploads.",
    responseExample: `{
  "documents": [{ "id": "4d2d7e0a-...", "name": "August invoice", "status": "active" }],
  "total": 1
}`,
  },
  "GET /documents/{id}": {
    category: "Documents",
    auth: "apikey",
    title: "Read a document",
    summary: "Returns the document record together with the caller's effective access level.",
    responseExample: `{
  "document": { "id": "4d2d7e0a-...", "name": "August invoice" },
  "access": { "level": "owner", "canRead": true, "canWrite": true }
}`,
  },
  "PATCH /documents/{id}": {
    category: "Documents",
    auth: "apikey",
    title: "Rename or move a document",
    summary: "Update the display name and optionally move the document into a folder.",
    responseExample: `{ "document": { "id": "4d2d7e0a-...", "name": "Invoice August" } }`,
  },
  "DELETE /documents/{id}": {
    category: "Documents",
    auth: "apikey",
    title: "Move to trash (or delete permanently)",
    summary: "Soft-deletes by default; set ?permanent=true to remove every version from storage.",
    responseExample: `{ "document": { "id": "4d2d7e0a-...", "status": "soft_deleted" } }`,
  },
  "POST /documents/{id}/restore": {
    category: "Documents",
    auth: "apikey",
    title: "Restore from trash",
    summary: "Restores a soft-deleted document back to active.",
    responseExample: `{ "document": { "id": "4d2d7e0a-...", "status": "active" } }`,
  },
  "POST /documents/{id}/download": {
    category: "Documents",
    auth: "apikey",
    title: "Create a download URL",
    summary: "Returns a short-lived signed URL. Fetch the bytes before it expires.",
    responseExample: `{
  "signedUrl": { "url": "https://...signed...", "expiresAt": "2026-08-24T12:45:00.000Z" },
  "download": { "url": "https://...signed..." }
}`,
  },
  "POST /documents/{id}/versions": {
    category: "Documents",
    auth: "apikey",
    title: "Add a new version",
    summary: "Starts a new version using the same session → PUT → confirm flow as an upload.",
    responseExample: `{
  "document": { "id": "4d2d7e0a-...", "currentVersion": 2 },
  "upload": { "url": "https://...signed..." }
}`,
  },
  "GET /documents/{id}/versions": {
    category: "Documents",
    auth: "apikey",
    title: "List versions",
    summary: "Returns the full version history of a document.",
    responseExample: `{
  "versions": [{ "versionNumber": 1, "size": 1024 }, { "versionNumber": 2, "size": 1280 }]
}`,
  },
  "POST /folders": {
    category: "Folders",
    auth: "onbehalf",
    title: "Create a folder",
    summary: "Creates a folder, optionally nested under a parent folder.",
    responseExample: `{ "folder": { "id": "f1c2b3a4-...", "name": "Contracts" } }`,
  },
  "GET /folders": {
    category: "Folders",
    auth: "apikey",
    title: "List folders",
    summary: "Returns folders under a parent. Use parentId=null for the root level.",
    responseExample: `{ "folders": [{ "id": "f1c2b3a4-...", "name": "Contracts" }] }`,
  },
  "PATCH /folders/{id}": {
    category: "Folders",
    auth: "apikey",
    title: "Rename a folder",
    summary: "Updates the folder name.",
    responseExample: `{ "folder": { "id": "f1c2b3a4-...", "name": "Contracts 2026" } }`,
  },
  "GET /folders/{id}/summary": {
    category: "Folders",
    auth: "apikey",
    title: "Folder deletion summary",
    summary: "Shows what a recursive delete would affect — for a confirmation step.",
    responseExample: `{ "folder": { "id": "f1c2b3a4-..." }, "folders": 2, "documents": 7, "bytes": 1048576 }`,
  },
  "DELETE /folders/{id}": {
    category: "Folders",
    auth: "apikey",
    title: "Delete a folder",
    summary: "Deletes the folder, its sub-folders and their documents in one operation (documents move to trash).",
    responseExample: `{
  "folder": { "id": "f1c2b3a4-..." },
  "deleted": { "folders": 2, "documents": 7, "bytes": 1048576 }
}`,
  },
  "POST /documents/{id}/permissions": {
    category: "Sharing",
    auth: "apikey",
    title: "Share a document",
    summary: "Grants access to a user or a role at one level: viewer, contributor, manager or owner.",
    notes: ["Granting the same principal again updates the existing grant instead of duplicating it."],
    responseExample: `{
  "permission": { "principalType": "user", "principalId": "<user-id>", "level": "viewer" }
}`,
  },
  "GET /documents/{id}/permissions": {
    category: "Sharing",
    auth: "apikey",
    title: "List document access",
    summary: "Returns the grants, the caller's effective access and the available levels.",
    responseExample: `{
  "permissions": [{ "principalType": "user", "principalId": "<user-id>", "level": "viewer" }],
  "access": { "level": "owner" }
}`,
  },
  "DELETE /documents/{id}/permissions/{permissionId}": {
    category: "Sharing",
    auth: "apikey",
    title: "Revoke access",
    summary: "Removes a grant. The document owner's access can never be revoked.",
    responseExample: `204 No Content — the grant was revoked.`,
  },
};

/* ── OpenAPI schema helpers ───────────────────────────────────────────────── */

function resolveRef(ref: string): any {
  const parts = ref.replace(/^#\//, "").split("/");
  let node: any = spec;
  for (const part of parts) node = node?.[part];
  return node;
}

function deref(schema: any): any {
  if (!schema) return schema;
  let current = schema;
  const seen = new Set<string>();
  while (current && current.$ref) {
    if (seen.has(current.$ref)) return current;
    seen.add(current.$ref);
    current = resolveRef(current.$ref);
  }
  return current;
}

function schemaType(schema: any): string {
  const s = deref(schema);
  if (!s) return "string";
  if (s.type === "array") return `array<${schemaType(s.items)}>`;
  if (s.format === "uuid") return "uuid";
  if (s.format === "date-time") return "date-time";
  if (s.enum) return s.enum.join(" | ");
  return s.type || "string";
}

function exampleFromSchema(schema: any, depth = 0): unknown {
  const s = deref(schema);
  if (!s || depth > 5) return null;
  if (s.example !== undefined) return s.example;
  if (s.properties) {
    const obj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(s.properties)) {
      obj[key] = exampleFromSchema(value, depth + 1);
    }
    return obj;
  }
  if (s.type === "array") return s.items ? [exampleFromSchema(s.items, depth + 1)] : [];
  if (s.enum) return s.enum[0];
  switch (s.type) {
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return false;
    case "string":
      return s.format === "uuid" ? "4d2d7e0a-0000-0000-0000-000000000000" : s.format === "date-time" ? "2026-08-24T12:00:00.000Z" : "string";
    default:
      return null;
  }
}

function fieldsFromSchema(schema: any): DocField[] {
  const s = deref(schema);
  if (!s?.properties) return [];
  const required = new Set(s.required || []);
  return Object.entries(s.properties).map(([name, prop]) => {
    const p = deref(prop);
    const example = p?.example !== undefined ? String(p.example) : undefined;
    return {
      name,
      location: "body" as const,
      type: schemaType(prop),
      required: required.has(name),
      description: p?.description,
      example,
    };
  });
}

function firstLine(value: string): string {
  return value.split("\n")[0].trim();
}

function buildOperation(key: string): DocOperation | null {
  const space = key.indexOf(" ");
  const method = key.slice(0, space).toUpperCase();
  const path = key.slice(space + 1);
  const specOp = spec.paths?.[path]?.[method.toLowerCase()];
  if (!specOp) return null;
  const meta = OPERATION_META[key];

  const parameters: DocField[] = (specOp.parameters || []).map((param: any) => ({
    name: param.name,
    location: param.in === "query" ? ("query" as const) : ("path" as const),
    type: schemaType(param.schema),
    required: Boolean(param.required),
    description: param.description,
  }));

  const requestSchema = specOp.requestBody?.content?.["application/json"]?.schema;
  const bodyFields = requestSchema ? fieldsFromSchema(requestSchema) : undefined;
  const bodyExample = requestSchema
    ? JSON.stringify(exampleFromSchema(requestSchema), null, 2)
    : undefined;

  return {
    id: key,
    category: meta.category,
    method: method as DocOperation["method"],
    path,
    title: meta.title || specOp.summary || key,
    summary:
      meta.summary || (specOp.description ? firstLine(specOp.description) : specOp.summary) || "",
    auth: AUTH_HEADERS[meta.auth || "apikey"],
    parameters,
    bodyFields,
    bodyExample,
    responseExample: meta.responseExample,
    notes: meta.notes,
  };
}

const BUILT = Object.keys(OPERATION_META)
  .map(buildOperation)
  .filter((op): op is DocOperation => op !== null);

/** Stable ids for operations that actually exist in the spec (the sync gate). */
const KNOWN_IDS = new Set(BUILT.map((op) => op.id));

/** Operations in canonical category order. */
export const DOC_OPERATIONS: DocOperation[] = BUILT.sort((a, b) => {
  const ca = DOC_CATEGORIES.indexOf(a.category);
  const cb = DOC_CATEGORIES.indexOf(b.category);
  return ca - cb || a.path.localeCompare(b.path);
});

export const DOC_OPERATION_SUMMARIES: DocOperationSummary[] = DOC_OPERATIONS.map(
  ({ id, category, method, path, title, summary }) => ({ id, category, method, path, title, summary })
);

/** Default selection shown when a platform administrator first opens the builder. */
export const DEFAULT_DOC_OPERATION_IDS: string[] = [
  "POST /documents",
  "POST /documents/{id}/upload",
  "GET /documents",
  "GET /documents/{id}",
  "POST /documents/{id}/download",
  "POST /folders",
  "GET /folders",
  "POST /documents/{id}/permissions",
];

export function isKnownOperation(id: string): boolean {
  return KNOWN_IDS.has(id);
}

/** Full operations for a selection, in canonical category order. */
export function resolveOperations(ids: string[]): DocOperation[] {
  const wanted = new Set(ids);
  return DOC_OPERATIONS.filter((op) => wanted.has(op.id));
}
