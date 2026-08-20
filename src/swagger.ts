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
      PermissionLevel: {
        type: "string",
        enum: ["viewer", "contributor", "manager", "owner"],
        description:
          "viewer: read and download. contributor: also rename and add versions. " +
          "manager: also move to trash. owner: full control including sharing.",
      },
      StorageConfig: {
        type: "object",
        description:
          "Only the fields used by the selected provider are accepted. Credentials are the " +
          "NAMES of environment variables resolved by the API at runtime, never secret values. " +
          "s3: container, region (+ optional accessKeyRef/secretKeyRef/sessionTokenRef/endpoint). " +
          "minio: container, endpoint, accessKeyRef, secretKeyRef (+ region, useSsl). " +
          "gcp: container, projectId (+ credentialsJsonRef). " +
          "azure: container, accountName, secretKeyRef (+ endpoint).",
        required: ["provider", "container"],
        properties: {
          provider: { type: "string", enum: ["s3", "minio", "gcp", "azure"] },
          container: { type: "string", example: "acme-documents" },
          region: { type: "string", example: "us-east-1" },
          endpoint: { type: "string", example: "https://minio.internal:9000" },
          accessKeyRef: { type: "string", example: "TENANT_ACME_ACCESS_KEY" },
          secretKeyRef: { type: "string", example: "TENANT_ACME_SECRET_KEY" },
          sessionTokenRef: { type: "string" },
          projectId: { type: "string", example: "acme-platform" },
          accountName: { type: "string", example: "acmestorage" },
          credentialsJsonRef: { type: "string", example: "TENANT_ACME_GCP_CREDENTIALS" },
          basePrefix: { type: "string", example: "dms" },
          useSsl: { type: "boolean" },
          signedUrlTtlSeconds: { type: "integer", example: 900 },
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
          {
            name: "createdBy",
            in: "query",
            description: "Only documents created by this principal",
            schema: { type: "string" },
          },
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
        summary: "Grant or update access for a user or role",
        description:
          "Access is granted as one level: viewer (read), contributor (read + write), " +
          "manager (read + write + delete) or owner (full control including sharing). " +
          "Granting the same principal twice updates the existing grant.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["principalType", "principalId", "level"],
                properties: {
                  principalType: { type: "string", enum: ["user", "role"] },
                  principalId: { type: "string", example: "bob@acme.example" },
                  level: { $ref: "#/components/schemas/PermissionLevel" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Existing grant updated" },
          "201": { description: "Grant created" },
          "403": { description: "Owner access required to manage sharing" },
        },
      },
      get: {
        tags: ["Permissions"],
        summary: "List access grants, the caller's effective access and the available levels",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Permissions" } },
      },
    },
    "/documents/{id}/permissions/{permissionId}": {
      delete: {
        tags: ["Permissions"],
        summary: "Revoke an access grant",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "permissionId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "204": { description: "Revoked" },
          "404": { description: "Grant not found" },
          "409": { description: "The document owner's access cannot be revoked" },
        },
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
    "/workspaces/resolve": {
      post: {
        tags: ["Tenants"],
        summary: "Resolve a workspace slug or id to a tenant (used by the sign-in screen)",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["workspace"],
                properties: {
                  workspace: { type: "string", example: "acme" },
                  user: { type: "string", example: "owner@acme.example" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Workspace" }, "404": { description: "Not found" } },
      },
    },
    "/tenants": {
      post: {
        tags: ["Tenants"],
        summary: "Onboard a tenant, optionally with its storage configuration (platform admin)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", example: "Acme Corporation" },
                  slug: { type: "string", example: "acme" },
                  ownerName: { type: "string" },
                  ownerEmail: { type: "string", format: "email" },
                  maxFileSizeBytes: { type: "integer", example: 52428800 },
                  allowedMimeTypes: { type: "array", items: { type: "string" }, nullable: true },
                  storage: { $ref: "#/components/schemas/StorageConfig" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
      get: { tags: ["Tenants"], summary: "List tenants (platform admin)", responses: { "200": { description: "Tenants" } } },
    },
    "/tenants/storage-providers": {
      get: {
        tags: ["Tenants"],
        summary: "Fields required by each storage provider",
        responses: { "200": { description: "Provider specifications" } },
      },
    },
    "/tenants/me": {
      get: { tags: ["Tenants"], summary: "Current tenant and storage configuration (secrets are references only)", responses: { "200": { description: "Tenant" } } },
    },
    "/tenants/{id}": {
      get: {
        tags: ["Tenants"],
        summary: "Read a tenant and its storage configuration",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Tenant" }, "403": { description: "Other tenant" } },
      },
      patch: {
        tags: ["Tenants"],
        summary: "Update tenant profile, limits or status",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  status: { type: "string", enum: ["active", "suspended"] },
                  ownerName: { type: "string" },
                  ownerEmail: { type: "string", format: "email" },
                  maxFileSizeBytes: { type: "integer" },
                  allowedMimeTypes: { type: "array", items: { type: "string" }, nullable: true },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Updated" } },
      },
    },
    "/tenants/{id}/users": {
      get: {
        tags: ["Tenants"],
        summary: "People active in a tenant with their document counts (tenant administrators)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Users" } },
      },
    },
    "/tenants/{id}/analytics": {
      get: {
        tags: ["Tenants"],
        summary: "Usage analytics for a tenant",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Analytics" } },
      },
    },
    "/tenants/{id}/storage": {
      put: {
        tags: ["Tenants"],
        summary: "Assign a storage provider to a tenant. Credentials must be env-var references, never raw secrets.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/StorageConfig" } } },
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
