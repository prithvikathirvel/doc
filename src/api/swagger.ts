import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Express } from "express";

const swaggerDefinition: swaggerJsdoc.OAS3Definition = {
  openapi: "3.0.0",
  info: {
    title: "Document Management System API",
    version: "2.0.0",
    description:
      "Vendor-agnostic DMS. The same API works for AWS S3, MinIO, Google Cloud Storage, and Azure Blob Storage. Storage credentials are never returned to clients.",
  },
  servers: [{ url: "/api", description: "API base" }],
  components: {
    securitySchemes: {
      idToken: {
        type: "apiKey",
        in: "header",
        name: "idtoken",
        description: "JWT identity token",
      },
      tenantHeader: {
        type: "apiKey",
        in: "header",
        name: "x-tenant-id",
      },
    },
    schemas: {
      Document: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          tenantId: { type: "string", format: "uuid" },
          folderId: { type: "string", format: "uuid", nullable: true },
          name: { type: "string" },
          originalFilename: { type: "string" },
          mimeType: { type: "string" },
          size: { type: "integer" },
          checksum: { type: "string", nullable: true },
          storageProvider: { type: "string", enum: ["s3", "minio", "gcp", "azure"] },
          storageContainer: { type: "string" },
          storageKey: { type: "string" },
          currentVersion: { type: "integer" },
          status: { type: "string", enum: ["pending_upload", "active", "soft_deleted", "failed"] },
          createdBy: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Error: {
        type: "object",
        properties: {
          status: { type: "string" },
          code: { type: "string" },
          message: { type: "string" },
        },
      },
    },
  },
  security: [{ idToken: [] }, { tenantHeader: [] }],
  paths: {
    "/documents": {
      post: {
        tags: ["Documents"],
        summary: "Create a document and an upload session (or proxy-upload a small file)",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["filename"],
                properties: {
                  filename: { type: "string", example: "contract.pdf" },
                  name: { type: "string" },
                  mimeType: { type: "string", example: "application/pdf" },
                  size: { type: "integer" },
                  folderId: { type: "string", format: "uuid" },
                  metadata: { type: "object" },
                  idempotencyKey: { type: "string" },
                },
              },
            },
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  file: { type: "string", format: "binary" },
                  filename: { type: "string" },
                  name: { type: "string" },
                  folderId: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Document created. Prefer uploading to the returned signed URL." },
        },
      },
      get: {
        tags: ["Documents"],
        summary: "List documents for the current tenant",
        parameters: [
          { name: "folderId", in: "query", schema: { type: "string" } },
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "includeDeleted", in: "query", schema: { type: "boolean" } },
          { name: "limit", in: "query", schema: { type: "integer" } },
          { name: "offset", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Document list" } },
      },
    },
    "/documents/{id}": {
      get: {
        tags: ["Documents"],
        summary: "Get a document",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Document" }, "404": { description: "Not found" } },
      },
      patch: {
        tags: ["Documents"],
        summary: "Rename or move a document",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: { name: { type: "string" }, folderId: { type: "string", nullable: true } },
              },
            },
          },
        },
        responses: { "200": { description: "Updated" } },
      },
      delete: {
        tags: ["Documents"],
        summary: "Soft-delete a document. Pass permanent=true to also delete storage objects.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "permanent", in: "query", schema: { type: "boolean" } },
        ],
        responses: { "200": { description: "Deleted" } },
      },
    },
    "/documents/{id}/upload": {
      post: {
        tags: ["Documents"],
        summary: "Mark a signed upload as complete after the client uploaded to storage",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Document is active" } },
      },
    },
    "/documents/{id}/download": {
      post: {
        tags: ["Documents"],
        summary: "Create a time-limited download URL",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Signed download URL" } },
      },
    },
    "/documents/{id}/content": {
      get: {
        tags: ["Documents"],
        summary: "Stream the file through the API (fallback when signed URLs are not used)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Binary stream" } },
      },
    },
    "/documents/{id}/metadata": {
      get: {
        tags: ["Documents"],
        summary: "Get DMS metadata plus storage object metadata",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Metadata" } },
      },
    },
    "/documents/{id}/restore": {
      post: {
        tags: ["Documents"],
        summary: "Restore a soft-deleted document",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Restored" } },
      },
    },
    "/documents/{id}/versions": {
      post: {
        tags: ["Documents"],
        summary: "Create a new DMS-level version (signed URL or multipart file)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "201": { description: "Version session created" } },
      },
      get: {
        tags: ["Documents"],
        summary: "List versions",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Versions" } },
      },
    },
    "/documents/{id}/permissions": {
      post: {
        tags: ["Permissions"],
        summary: "Grant document permissions",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "201": { description: "Granted" } },
      },
      get: {
        tags: ["Permissions"],
        summary: "List document permissions",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Permissions" } },
      },
    },
    "/folders": {
      post: {
        tags: ["Folders"],
        summary: "Create a folder",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: { name: { type: "string" }, parentId: { type: "string", nullable: true } },
              },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
      get: {
        tags: ["Folders"],
        summary: "List folders",
        parameters: [{ name: "parentId", in: "query", schema: { type: "string" } }],
        responses: { "200": { description: "Folders" } },
      },
    },
    "/folders/{id}": {
      get: { tags: ["Folders"], summary: "Get folder", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Folder" } } },
      patch: { tags: ["Folders"], summary: "Rename folder", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } },
      delete: { tags: ["Folders"], summary: "Soft-delete folder", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "204": { description: "Deleted" } } },
    },
    "/tenants": {
      post: { tags: ["Tenants"], summary: "Create a tenant (platform admin)", responses: { "201": { description: "Created" } } },
      get: { tags: ["Tenants"], summary: "List tenants (platform admin)", responses: { "200": { description: "Tenants" } } },
    },
    "/tenants/me": {
      get: { tags: ["Tenants"], summary: "Current tenant and storage configuration (secrets are references only)", responses: { "200": { description: "Tenant" } } },
    },
    "/tenants/{id}/storage": {
      put: {
        tags: ["Tenants"],
        summary: "Assign a storage provider to a tenant. Credentials must be env-var references, never raw secrets.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["provider", "container"],
                properties: {
                  provider: { type: "string", enum: ["s3", "minio", "gcp", "azure"] },
                  container: { type: "string" },
                  region: { type: "string" },
                  endpoint: { type: "string" },
                  accessKeyRef: { type: "string", example: "TENANT_ACME_ACCESS_KEY" },
                  secretKeyRef: { type: "string", example: "TENANT_ACME_SECRET_KEY" },
                  projectId: { type: "string" },
                  accountName: { type: "string" },
                  credentialsJsonRef: { type: "string" },
                  basePrefix: { type: "string" },
                  useSsl: { type: "boolean" },
                  signedUrlTtlSeconds: { type: "integer" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Configured" } },
      },
    },
  },
};

const swaggerSpec = swaggerJsdoc({ swaggerDefinition, apis: [] });

export function setupSwagger(app: Express): void {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/api-docs.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });
}
