import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Express } from "express";

const uuid = { type: "string", format: "uuid" } as const;
const dateTime = { type: "string", format: "date-time" } as const;

const pathParam = (name: string, description: string) => ({
  name,
  in: "path" as const,
  required: true,
  description,
  schema: { type: "string" },
});

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
});

const jsonResponse = (description: string, ref: string) => ({
  description,
  content: { "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } },
});

const swaggerDefinition: swaggerJsdoc.OAS3Definition = {
  openapi: "3.0.3",
  info: {
    title: "Document Management System API",
    version: "2.0.0",
    description: [
      "Vendor-agnostic, tenant-oriented DMS. The same API stores documents in AWS S3, MinIO,",
      "Google Cloud Storage or Azure Blob Storage. Storage credentials are never returned.",
      "",
      "### Authenticating in this page",
      "",
      "How a request authenticates is decided in this order:",
      "",
      "1. **`x-api-key`** — machine clients. The key carries its own workspace scope and roles.",
      "2. **Session cookie / `idtoken`** — the web UI. A Keycloak access token, verified against the",
      "   realm's published keys; workspace and roles are resolved from the DMS directory, never from",
      "   the token. Header `x-tenant-id` selects the workspace when a user belongs to several.",
      "3. **Trusted headers** (only when the deployment sets `AUTH_DISABLED=true`):",
      "",
      "| Field | Required | Example |",
      "| --- | --- | --- |",
      "| `x-user-id` | always | `jane@acme.com` |",
      "| `x-tenant-id` | for every tenant-scoped call | `11111111-1111-1111-1111-111111111111` |",
      "| `x-roles` | recommended | `tenant_admin` or `platform_admin` |",
      "| `x-user-name` | optional | `Jane Doe` |",
      "",
      "Browser sessions sign in at `POST /auth/login` and keep tokens in httpOnly cookies;",
      "the cookies are never readable from JavaScript.",
      "",
      "Object layout in storage: `<basePrefix>/<tenantId>/<userId>/<documentId>/v<n>/<filename>`.",
    ].join("\n"),
  },
  servers: [{ url: "/api", description: "API base path" }],
  tags: [
    { name: "Platform", description: "Health, metrics and sign-in helpers" },
    { name: "Tenants", description: "Onboarding, storage configuration, analytics and people" },
    { name: "Folders", description: "Folder tree, including recursive delete" },
    { name: "Documents", description: "Upload, download, versions and lifecycle" },
    { name: "Permissions", description: "Per-document access grants" },
  ],
  components: {
    securitySchemes: {
      userHeader: {
        type: "apiKey",
        in: "header",
        name: "x-user-id",
        description: "Identifier of the caller, for example jane@acme.com. Always required.",
      },
      tenantHeader: {
        type: "apiKey",
        in: "header",
        name: "x-tenant-id",
        description: "Tenant the request operates on. Required for every tenant-scoped endpoint.",
      },
      rolesHeader: {
        type: "apiKey",
        in: "header",
        name: "x-roles",
        description: "Comma separated roles: platform_admin, tenant_admin or member.",
      },
      userNameHeader: {
        type: "apiKey",
        in: "header",
        name: "x-user-name",
        description: "Display name recorded in audit entries. Optional.",
      },
      idToken: {
        type: "apiKey",
        in: "header",
        name: "idtoken",
        description: "Keycloak access token (the web UI uses the dms_at cookie instead).",
      },
      apiKeyHeader: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description:
          "API key for machine clients (created by platform administrators at /api-keys). " +
          "Optionally combined with x-user-id to attribute the request to an end user of yours " +
          "(authority still comes from the key alone).",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          status: { type: "string", example: "error" },
          code: { type: "string", example: "VALIDATION_ERROR" },
          message: { type: "string" },
          requestId: { type: "string", description: "Correlation id, also logged by the API" },
        },
      },
      Health: {
        type: "object",
        properties: {
          status: { type: "string", example: "ok" },
          database: { type: "string", example: "up" },
          providers: { type: "array", items: { type: "string" }, example: ["s3", "minio"] },
        },
      },
      Workspace: {
        type: "object",
        properties: {
          workspace: {
            type: "object",
            properties: {
              id: uuid,
              name: { type: "string", example: "Acme Corporation" },
              slug: { type: "string", example: "acme" },
              status: { type: "string", enum: ["active", "suspended"] },
            },
          },
          roles: { type: "array", items: { type: "string" }, example: ["tenant_admin"] },
        },
      },
      Tenant: {
        type: "object",
        properties: {
          id: uuid,
          name: { type: "string", example: "Acme Corporation" },
          slug: { type: "string", example: "acme" },
          status: { type: "string", enum: ["active", "suspended"] },
          ownerName: { type: "string", nullable: true, example: "Jane Doe" },
          ownerEmail: { type: "string", nullable: true, example: "jane@acme.com" },
          maxFileSizeBytes: { type: "integer", example: 52428800 },
          allowedMimeTypes: { type: "array", nullable: true, items: { type: "string" } },
          versioningEnabled: {
            type: "boolean",
            description: "When false, documents keep a single version; uploading new versions returns 403 VERSIONING_DISABLED.",
          },
          createdAt: dateTime,
          updatedAt: dateTime,
        },
      },
      StorageConfig: {
        type: "object",
        description: [
          "Only the fields used by the selected provider are accepted; anything else is rejected.",
          "Credential fields hold the NAME of an environment variable, never a secret value.",
          "s3: container, region (+ endpoint, accessKeyRef + secretKeyRef, sessionTokenRef).",
          "minio: container, endpoint, accessKeyRef, secretKeyRef (+ region). TLS follows the endpoint scheme.",
          "gcp: container, projectId (+ credentialsJsonRef).",
          "azure: container, accountName, secretKeyRef (+ endpoint).",
        ].join(" "),
        required: ["provider", "container"],
        properties: {
          provider: { type: "string", enum: ["s3", "minio", "gcp", "azure"] },
          container: { type: "string", example: "acme-documents" },
          region: { type: "string", example: "ap-south-1" },
          endpoint: { type: "string", example: "https://minio.acme.internal:9000" },
          accessKeyRef: { type: "string", example: "TENANT_ACME_ACCESS_KEY" },
          secretKeyRef: { type: "string", example: "TENANT_ACME_SECRET_KEY" },
          sessionTokenRef: { type: "string", example: "TENANT_ACME_SESSION_TOKEN" },
          projectId: { type: "string", example: "acme-platform-prod" },
          accountName: { type: "string", example: "acmeprodstorage" },
          credentialsJsonRef: { type: "string", example: "TENANT_ACME_GCP_CREDENTIALS" },
          basePrefix: { type: "string", example: "dms" },
          useSsl: { type: "boolean" },
          signedUrlTtlSeconds: { type: "integer", example: 900 },
        },
      },
      TenantUser: {
        type: "object",
        properties: {
          userId: { type: "string", example: "jane@acme.com" },
          isOwner: { type: "boolean" },
          documents: { type: "integer" },
          activeDocuments: { type: "integer" },
          trashedDocuments: { type: "integer" },
          bytes: { type: "integer" },
          versions: { type: "integer" },
          sharedWithThem: { type: "integer" },
          firstActivityAt: { ...dateTime, nullable: true },
          lastActivityAt: { ...dateTime, nullable: true },
        },
      },
      Folder: {
        type: "object",
        properties: {
          id: uuid,
          tenantId: uuid,
          parentId: { ...uuid, nullable: true },
          name: { type: "string", example: "Contracts" },
          path: { type: "string", example: "/Contracts/2026" },
          createdBy: { type: "string" },
          updatedBy: { type: "string" },
          createdAt: dateTime,
          updatedAt: dateTime,
          deletedAt: { ...dateTime, nullable: true },
        },
      },
      FolderSummary: {
        type: "object",
        description: "What a recursive delete of this folder would affect.",
        properties: {
          folder: { $ref: "#/components/schemas/Folder" },
          folders: { type: "integer", description: "Sub-folders below this folder" },
          documents: { type: "integer", description: "Documents that would move to trash" },
          bytes: { type: "integer" },
        },
      },
      FolderMap: {
        type: "object",
        description:
          "A named path template applications reference instead of folder ids. Each template segment is " +
          "either a literal folder name or exactly one {placeholder}; at upload each variable value " +
          "becomes exactly one validated folder level.",
        required: ["key", "pathTemplate"],
        properties: {
          key: { type: "string", example: "submissions", description: "Lowercase slug the integration calls." },
          pathTemplate: { type: "string", example: "submissions/{orgId}/{formId}" },
          description: { type: "string", nullable: true, example: "Respondent file uploads" },
          status: { type: "string", enum: ["active", "disabled"] },
          createdAt: dateTime,
          updatedAt: dateTime,
        },
      },
      Document: {
        type: "object",
        properties: {
          id: uuid,
          tenantId: uuid,
          folderId: { ...uuid, nullable: true },
          name: { type: "string", example: "Master service agreement" },
          originalFilename: { type: "string", example: "msa.pdf" },
          mimeType: { type: "string", example: "application/pdf" },
          size: { type: "integer" },
          checksum: { type: "string", nullable: true },
          storageProvider: { type: "string", enum: ["s3", "minio", "gcp", "azure"] },
          storageContainer: { type: "string" },
          storageKey: {
            type: "string",
            example: "dms/11111111-1111-1111-1111-111111111111/jane_acme.com/6f0e.../v1/msa.pdf",
          },
          currentVersion: { type: "integer" },
          status: { type: "string", enum: ["pending_upload", "active", "soft_deleted", "failed"] },
          createdBy: { type: "string" },
          updatedBy: { type: "string" },
          createdAt: dateTime,
          updatedAt: dateTime,
          deletedAt: { ...dateTime, nullable: true },
          metadata: { type: "object", additionalProperties: true },
        },
      },
      DocumentList: {
        type: "object",
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/Document" } },
          total: { type: "integer" },
        },
      },
      DocumentVersion: {
        type: "object",
        properties: {
          id: uuid,
          documentId: uuid,
          versionNumber: { type: "integer" },
          size: { type: "integer" },
          mimeType: { type: "string" },
          storageKey: { type: "string" },
          checksum: { type: "string", nullable: true },
          createdBy: { type: "string" },
          createdAt: dateTime,
        },
      },
      SignedUrl: {
        type: "object",
        properties: {
          url: { type: "string" },
          method: { type: "string", enum: ["GET", "PUT"] },
          headers: { type: "object", additionalProperties: { type: "string" } },
          expiresAt: dateTime,
        },
      },
      UploadSession: {
        type: "object",
        properties: {
          document: { $ref: "#/components/schemas/Document" },
          upload: { ...{ $ref: "#/components/schemas/SignedUrl" } },
          replayed: { type: "boolean" },
        },
      },
      PermissionLevel: {
        type: "string",
        enum: ["viewer", "contributor", "manager", "owner"],
        description:
          "viewer: read and download. contributor: also rename and add versions. " +
          "manager: also move to trash. owner: full control including sharing.",
      },
      DocumentAccess: {
        type: "object",
        properties: {
          canRead: { type: "boolean" },
          canWrite: { type: "boolean" },
          canDelete: { type: "boolean" },
          canAdmin: { type: "boolean" },
          level: { $ref: "#/components/schemas/PermissionLevel" },
          source: {
            type: "string",
            enum: ["platform_admin", "tenant_admin", "creator", "user_grant", "role_grant", "none"],
          },
        },
      },
      DocumentPermission: {
        type: "object",
        properties: {
          id: uuid,
          documentId: uuid,
          principalType: { type: "string", enum: ["user", "role"] },
          principalId: { type: "string", example: "carlos@acme.com" },
          level: { $ref: "#/components/schemas/PermissionLevel" },
          canRead: { type: "boolean" },
          canWrite: { type: "boolean" },
          canDelete: { type: "boolean" },
          canAdmin: { type: "boolean" },
          isDocumentCreator: { type: "boolean" },
          createdBy: { type: "string" },
          createdAt: dateTime,
        },
      },
    },
  },
  // Applied to every operation unless overridden with `security: []`.
  security: [
    { userHeader: [], tenantHeader: [], rolesHeader: [], userNameHeader: [] },
    { idToken: [] },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Platform"],
        summary: "Service and database health",
        security: [],
        responses: {
          "200": jsonResponse("Healthy", "Health"),
          "503": jsonResponse("Degraded", "Health"),
        },
      },
    },
    "/metrics": {
      get: {
        tags: ["Platform"],
        summary: "In-process counters and latencies",
        security: [],
        responses: { "200": { description: "Metrics snapshot" } },
      },
    },
    "/workspaces/resolve": {
      post: {
        tags: ["Platform"],
        summary: "Resolve a workspace id or slug (sign-in helper)",
        description:
          "Returns the tenant behind a workspace slug or id. It grants nothing: roles come " +
          "exclusively from the authenticated session resolved by the DMS directory.",
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
                  user: { type: "string", example: "jane@acme.com" },
                },
              },
            },
          },
        },
        responses: {
          "200": jsonResponse("Workspace", "Workspace"),
          "404": errorResponse("Workspace not found"),
        },
      },
    },

    "/auth/login": {
      post: {
        tags: ["Platform"],
        summary: "Sign in with email + password (Keycloak via the User Service)",
        description:
          "Exchanges credentials for an httpOnly cookie session. Tokens never reach the browser. " +
          "The response describes the user, whether they are a platform administrator, and their workspaces.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email", example: "jane@acme.com" },
                  password: { type: "string", example: "••••••••" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Session",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    session: {
                      type: "object",
                      properties: {
                        user: {
                          type: "object",
                          properties: {
                            userId: uuid,
                            email: { type: "string" },
                            displayName: { type: "string" },
                            username: { type: "string", nullable: true },
                          },
                        },
                        isPlatformAdmin: { type: "boolean" },
                        memberships: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              tenantId: uuid,
                              name: { type: "string" },
                              slug: { type: "string" },
                              status: { type: "string" },
                              role: { type: "string", example: "member" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": errorResponse("Invalid credentials"),
        },
      },
    },
    "/auth/signup": {
      post: {
        tags: ["Platform"],
        summary: "Create an account (no workspace yet)",
        description:
          "Creates the account in the identity provider. A workspace administrator then adds " +
          "the account to a workspace, whereupon it can sign in.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email", example: "new.person@acme.com" },
                  password: { type: "string", example: "••••••••" },
                  username: { type: "string" },
                  firstName: { type: "string" },
                  lastName: { type: "string" },
                  phone: { type: "string" },
                  gender: { type: "string" },
                  address: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Account created" }, "400": errorResponse("Validation failed") },
      },
    },
    "/auth/session": {
      get: {
        tags: ["Platform"],
        summary: "Describe the cookie session",
        description: "Returns the user, platform flag and workspaces. 401 TOKEN_EXPIRED asks the client to call /auth/refresh.",
        security: [],
        responses: { "200": { description: "Session" }, "401": errorResponse("Not signed in") },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["Platform"],
        summary: "Refresh the cookie session",
        description: "Uses the refresh cookie; on success new cookies are set.",
        security: [],
        responses: { "200": { description: "Session" }, "401": errorResponse("Session expired — sign in again") },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Platform"],
        summary: "Sign out",
        description: "Revokes the refresh token at Keycloak and clears the cookies.",
        security: [],
        responses: { "200": { description: "Signed out" } },
      },
    },
    "/api-keys": {
      get: {
        tags: ["Platform"],
        summary: "List API keys (platform_admin)",
        responses: { "200": { description: "API keys (hashes are never returned)" }, "403": errorResponse("Forbidden") },
      },
      post: {
        tags: ["Platform"],
        summary: "Create an API key (platform_admin)",
        description:
          "Returns the full key exactly once. Scope it to a workspace and give it the least role it needs. " +
          "Send it as the x-api-key header.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["displayName"],
                properties: {
                  displayName: { type: "string", example: "acme import worker" },
                  tenantId: { ...uuid, nullable: true },
                  roles: { type: "array", items: { type: "string" }, example: ["member"] },
                  expiresAt: { ...dateTime, nullable: true },
                },
              },
            },
          },
        },
        responses: { "201": { description: "The created key (full secret shown once)" } },
      },
    },
    "/api-keys/{id}": {
      patch: {
        tags: ["Platform"],
        summary: "Enable or disable an API key (platform_admin)",
        parameters: [pathParam("id", "API key id")],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["status"], properties: { status: { type: "string", enum: ["active", "disabled"] } } } } },
        },
        responses: { "200": { description: "Updated" } },
      },
      delete: {
        tags: ["Platform"],
        summary: "Delete an API key (platform_admin)",
        parameters: [pathParam("id", "API key id")],
        responses: { "204": { description: "Deleted" } },
      },
    },
    "/users": {
      post: {
        tags: ["Tenants"],
        summary: "Create an account and optionally attach it to a workspace",
        description:
          "Creates the account in the identity provider and links it in DMS. With tenantId it is " +
          "also attached to the workspace and any legacy activity under claimAliases is re-pointed " +
          "to the new account. Platform administrators may create accounts without a workspace.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string" },
                  username: { type: "string" },
                  firstName: { type: "string" },
                  lastName: { type: "string" },
                  tenantId: uuid,
                  role: { type: "string", enum: ["tenant_admin", "member"] },
                  claimAliases: { type: "array", items: { type: "string" }, example: ["legacy.worker@acme.com"] },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created (with claim counts)" }, "403": errorResponse("Forbidden") },
      },
    },
    "/tenants/{id}/members": {
      get: {
        tags: ["Tenants"],
        summary: "List workspace members (administrators)",
        parameters: [pathParam("id", "Tenant id")],
        responses: { "200": { description: "Members" }, "403": errorResponse("Forbidden") },
      },
      post: {
        tags: ["Tenants"],
        summary: "Add an existing account to the workspace and claim its legacy activity",
        description:
          "Documents uploaded earlier by a machine client under the user's earlier x-user-id " +
          "(email, employee code…) are re-pointed to the canonical account id, so the member " +
          "sees them in the member view immediately.",
        parameters: [pathParam("id", "Tenant id")],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", format: "email" },
                  userId: uuid,
                  role: { type: "string", enum: ["tenant_admin", "member"] },
                  claimAliases: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Membership created, with claim counts" }, "404": errorResponse("No such DMS account") },
      },
    },
    "/tenants/{id}/members/{userId}": {
      patch: {
        tags: ["Tenants"],
        summary: "Change a member's role or suspend them",
        parameters: [pathParam("id", "Tenant id"), pathParam("userId", "User id")],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  role: { type: "string", enum: ["tenant_admin", "member"] },
                  status: { type: "string", enum: ["active", "disabled"] },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Updated" } },
      },
      delete: {
        tags: ["Tenants"],
        summary: "Remove a member from the workspace",
        parameters: [pathParam("id", "Tenant id"), pathParam("userId", "User id")],
        responses: { "204": { description: "Removed" } },
      },
    },

    "/tenants": {
      post: {
        tags: ["Tenants"],
        summary: "Onboard a tenant, optionally with its storage (platform_admin)",
        description:
          "Storage is validated before the tenant row is written, so onboarding never half-succeeds.",
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
                  ownerName: { type: "string", example: "Jane Doe" },
                  ownerEmail: { type: "string", format: "email", example: "jane@acme.com" },
                  maxFileSizeBytes: { type: "integer", example: 52428800 },
                  allowedMimeTypes: {
                    type: "array",
                    nullable: true,
                    items: { type: "string" },
                    example: ["application/pdf", "image/png"],
                  },
                  versioningEnabled: {
                    type: "boolean",
                    default: true,
                    description: "Disable to keep every document at a single version (v1).",
                  },
                  storage: { $ref: "#/components/schemas/StorageConfig" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Tenant created" },
          "403": errorResponse("platform_admin role required"),
          "409": errorResponse("Workspace id already taken"),
          "422": errorResponse("Validation failed"),
        },
      },
      get: {
        tags: ["Tenants"],
        summary: "List tenants (platform_admin)",
        responses: {
          "200": { description: "Tenants" },
          "403": errorResponse("platform_admin role required"),
        },
      },
    },
    "/tenants/storage-providers": {
      get: {
        tags: ["Tenants"],
        summary: "Fields required by each storage provider",
        responses: { "200": { description: "Provider specifications" } },
      },
    },
    "/tenants/me": {
      get: {
        tags: ["Tenants"],
        summary: "Tenant of the caller with its storage configuration",
        responses: {
          "200": { description: "Tenant and storage" },
          "401": errorResponse("Identity headers missing"),
        },
      },
    },
    "/tenants/{id}": {
      get: {
        tags: ["Tenants"],
        summary: "Read a tenant and its storage configuration",
        parameters: [pathParam("id", "Tenant id")],
        responses: {
          "200": { description: "Tenant and storage" },
          "403": errorResponse("Another tenant"),
          "404": errorResponse("Tenant not found"),
        },
      },
      patch: {
        tags: ["Tenants"],
        summary: "Update profile, limits or status",
        description: "Only a platform administrator may change the status.",
        parameters: [pathParam("id", "Tenant id")],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  status: { type: "string", enum: ["active", "suspended"] },
                  ownerName: { type: "string", nullable: true },
                  ownerEmail: { type: "string", format: "email", nullable: true },
                  maxFileSizeBytes: { type: "integer" },
                  allowedMimeTypes: { type: "array", nullable: true, items: { type: "string" } },
                  versioningEnabled: { type: "boolean", description: "Platform administrators only." },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Updated" }, "403": errorResponse("Not allowed") },
      },
    },
    "/tenants/{id}/storage": {
      put: {
        tags: ["Tenants"],
        summary: "Attach or replace the storage configuration",
        parameters: [pathParam("id", "Tenant id")],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/StorageConfig" } } },
        },
        responses: {
          "200": { description: "Configured" },
          "422": errorResponse("Field missing or not used by this provider"),
        },
      },
    },
    "/tenants/{id}/analytics": {
      get: {
        tags: ["Tenants"],
        summary: "Usage analytics (tenant administrators)",
        parameters: [pathParam("id", "Tenant id")],
        responses: { "200": { description: "Analytics" }, "403": errorResponse("Admin role required") },
      },
    },
    "/tenants/{id}/users": {
      get: {
        tags: ["Tenants"],
        summary: "People active in a tenant (tenant administrators)",
        parameters: [pathParam("id", "Tenant id")],
        responses: {
          "200": {
            description: "Users",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    users: { type: "array", items: { $ref: "#/components/schemas/TenantUser" } },
                  },
                },
              },
            },
          },
        },
      },
    },

    "/folders/ensure": {
      post: {
        tags: ["Folders"],
        summary: "Ensure a folder path exists (idempotent get-or-create)",
        description:
          "Creates every missing segment of a path like `submissions/org-123/form-456` and returns the " +
          "final folder. Safe to call repeatedly and from concurrent callers: the database guarantees a " +
          "single folder per (tenant, parent, name). Segments may not be empty, `.` or `..`, contain `/` " +
          "or control characters; depth is limited to 16 levels.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["path"],
                properties: { path: { type: "string", example: "submissions/org-123/form-456" } },
              },
            },
          },
        },
        responses: {
          "200": jsonResponse("Folder", "Folder"),
          "422": errorResponse("Invalid path"),
        },
      },
    },
    "/folders/resolve": {
      get: {
        tags: ["Folders"],
        summary: "Resolve a folder path to its folder record",
        description: "Read-only lookup by materialized path; never creates anything.",
        parameters: [
          {
            name: "path",
            in: "query",
            required: true,
            description: "Folder path, with or without a leading slash.",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": jsonResponse("Folder", "Folder"),
          "404": errorResponse("Folder not found"),
        },
      },
    },
    "/folders/maps": {
      get: {
        tags: ["Folders"],
        summary: "List the workspace's folder maps",
        description:
          "Folder maps are named path templates (for example `submissions` → `submissions/{orgId}/{formId}`) " +
          "that applications reference instead of folder ids. Readable by every workspace member.",
        responses: { "200": { description: "Maps" } },
      },
      put: {
        tags: ["Folders"],
        summary: "Replace the workspace's folder maps (workspace administrators)",
        description:
          "A PUT replaces the whole set. Keys are lowercase slugs; each template segment is either a literal " +
          "folder name or exactly one `{placeholder}`. When uploading, each variable value becomes exactly one " +
          "validated folder level — values containing `/` or `..` are rejected.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["maps"],
                properties: {
                  maps: {
                    type: "array",
                    items: { $ref: "#/components/schemas/FolderMap" },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "The saved set of maps" },
          "403": errorResponse("Workspace administrator role required"),
          "422": errorResponse("Invalid key or template"),
        },
      },
    },

    "/folders": {
      post: {
        tags: ["Folders"],
        summary: "Create a folder",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", example: "Contracts" },
                  parentId: { ...uuid, nullable: true },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" }, "409": errorResponse("Name already used") },
      },
      get: {
        tags: ["Folders"],
        summary: "List folders",
        parameters: [
          {
            name: "parentId",
            in: "query",
            description: "Folder id, or the literal `null` for root level. Omit for all folders.",
            schema: { type: "string" },
          },
        ],
        responses: { "200": { description: "Folders" } },
      },
    },
    "/folders/{id}": {
      get: {
        tags: ["Folders"],
        summary: "Read a folder",
        parameters: [pathParam("id", "Folder id")],
        responses: { "200": { description: "Folder" }, "404": errorResponse("Not found") },
      },
      patch: {
        tags: ["Folders"],
        summary: "Rename a folder",
        parameters: [pathParam("id", "Folder id")],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["name"], properties: { name: { type: "string" } } },
            },
          },
        },
        responses: { "200": { description: "Renamed" } },
      },
      delete: {
        tags: ["Folders"],
        summary: "Delete a folder and everything inside it",
        description:
          "Recursive: the folder, its sub-folders and all documents inside them are removed in one " +
          "transaction. Documents are moved to trash and can be restored. Call the summary endpoint " +
          "first to show a confirmation.",
        parameters: [pathParam("id", "Folder id")],
        responses: {
          "200": {
            description: "Deleted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    folder: { $ref: "#/components/schemas/Folder" },
                    deleted: {
                      type: "object",
                      properties: {
                        folders: { type: "integer" },
                        documents: { type: "integer" },
                        bytes: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
          "403": errorResponse("Only the owner or a tenant administrator"),
        },
      },
    },
    "/folders/{id}/summary": {
      get: {
        tags: ["Folders"],
        summary: "Count what a recursive delete would affect",
        parameters: [pathParam("id", "Folder id")],
        responses: { "200": jsonResponse("Summary", "FolderSummary") },
      },
    },

    "/documents": {
      post: {
        tags: ["Documents"],
        summary: "Create a document: upload session, or direct upload of a small file",
        description:
          "Send JSON to receive a signed upload URL, or multipart/form-data with a `file` field to " +
          "upload through the API. The object is written to " +
          "`<basePrefix>/<tenantId>/<userId>/<documentId>/v1/<filename>`.\n\n" +
          "Where the document is filed can be expressed three ways (mutually exclusive — `folderId: null` " +
          "counts as absent): `folderId` as before, `folderPath` (every missing segment is ensured " +
          "automatically), or `folderMap` + `folderVars` referencing one of the workspace's folder maps. " +
          "Metadata tags are stored with the document and can be filtered on the list endpoint.\n\n" +
          "**Replays:** a request whose `Idempotency-Key` matches an earlier document returns that document " +
          "(`replayed: true`) — and the retry's folder target and metadata tags are applied to it (metadata-only " +
          "updates). Send each logical upload its own key, and avoid duplicate JSON keys: parsers keep the last one.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["filename"],
                properties: {
                  filename: { type: "string", example: "contract.pdf" },
                  name: { type: "string", example: "Signed contract" },
                  mimeType: { type: "string", example: "application/pdf" },
                  size: { type: "integer", example: 482000 },
                  folderId: { ...uuid, nullable: true },
                  folderPath: {
                    type: "string",
                    example: "submissions/org-123/form-456",
                    description: "Alternative to folderId — ensured idempotently before the document is filed.",
                  },
                  folderMap: {
                    type: "string",
                    example: "submissions",
                    description: "Alternative to folderId — a workspace folder map key.",
                  },
                  folderVars: {
                    type: "object",
                    additionalProperties: { type: "string" },
                    example: { orgId: "org-123", formId: "form-456" },
                    description: "Values for the map's placeholders; each becomes exactly one folder level.",
                  },
                  metadata: { type: "object", additionalProperties: true, example: { orgId: "org-123", formId: "form-456" } },
                  idempotencyKey: { type: "string", example: "invoice-2026-08" },
                },
              },
            },
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
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
          "201": jsonResponse("Created", "UploadSession"),
          "422": errorResponse("File rejected by the tenant policy"),
        },
      },
      get: {
        tags: ["Documents"],
        summary: "List documents for the current tenant",
        description:
          "Tenant administrators see every document. Members see the documents they created or " +
          "were granted access to.",
        parameters: [
          { name: "folderId", in: "query", description: "Folder id, or `null` for root", schema: { type: "string" } },
          {
            name: "path",
            in: "query",
            description: "Folder path (e.g. `/submissions/org-123/form-456`) — resolved to its folder in the same call.",
            schema: { type: "string" },
          },
          {
            name: "metadata",
            in: "query",
            style: "deepObject",
            explode: true,
            description:
              "Exact-match filters on document metadata, e.g. `metadata.orgId=org-123&metadata.formId=form-456`. Combined with the caller's visibility scope.",
            schema: { type: "object", additionalProperties: { type: "string" } },
          },
          { name: "q", in: "query", description: "Name search", schema: { type: "string" } },
          { name: "createdBy", in: "query", description: "Only documents owned by this principal", schema: { type: "string" } },
          { name: "includeDeleted", in: "query", schema: { type: "boolean" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: { "200": jsonResponse("Documents", "DocumentList") },
      },
    },
    "/documents/{id}": {
      get: {
        tags: ["Documents"],
        summary: "Read a document and the caller's effective access",
        parameters: [
          pathParam("id", "Document id"),
          { name: "includeDeleted", in: "query", schema: { type: "boolean" } },
        ],
        responses: {
          "200": {
            description: "Document",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    document: { $ref: "#/components/schemas/Document" },
                    access: { $ref: "#/components/schemas/DocumentAccess" },
                  },
                },
              },
            },
          },
          "403": errorResponse("No read access"),
        },
      },
      patch: {
        tags: ["Documents"],
        summary: "Rename or move a document",
        parameters: [pathParam("id", "Document id")],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: { name: { type: "string" }, folderId: { ...uuid, nullable: true } },
              },
            },
          },
        },
        responses: { "200": { description: "Updated" } },
      },
      delete: {
        tags: ["Documents"],
        summary: "Move to trash, or delete permanently",
        parameters: [
          pathParam("id", "Document id"),
          {
            name: "permanent",
            in: "query",
            description: "true also removes every version from storage",
            schema: { type: "boolean" },
          },
        ],
        responses: { "200": { description: "Deleted" }, "403": errorResponse("No delete access") },
      },
    },
    "/documents/{id}/upload": {
      post: {
        tags: ["Documents"],
        summary: "Confirm that a signed upload reached storage",
        parameters: [pathParam("id", "Document id")],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { size: { type: "integer" }, checksum: { type: "string" } },
              },
            },
          },
        },
        responses: { "200": { description: "Document activated" }, "400": errorResponse("Object not in storage") },
      },
    },
    "/documents/{id}/download": {
      post: {
        tags: ["Documents"],
        summary: "Create a signed download URL",
        parameters: [pathParam("id", "Document id")],
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { versionNumber: { type: "integer" } } },
            },
          },
        },
        responses: { "200": { description: "Download session" } },
      },
    },
    "/documents/{id}/preview": {
      post: {
        tags: ["Documents"],
        summary: "Create a signed browser-preview URL",
        description:
          "Returns a short-lived GET URL with inline content disposition for browser-renderable types such as PDF, image, text, audio and video. The signed URL points directly at object storage; the API remains out of the byte path.",
        parameters: [pathParam("id", "Document id")],
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { versionNumber: { type: "integer" } } },
            },
          },
        },
        responses: {
          "200": {
            description: "Preview session",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    document: { $ref: "#/components/schemas/Document" },
                    version: { $ref: "#/components/schemas/DocumentVersion" },
                    signedUrl: { $ref: "#/components/schemas/SignedUrl" },
                    previewable: { type: "boolean" },
                    disposition: { type: "string", enum: ["inline"] },
                  },
                },
              },
            },
          },
          "404": errorResponse("Document, version or storage object not found"),
        },
      },
    },
    "/documents/{id}/content": {
      get: {
        tags: ["Documents"],
        summary: "Stream the file through the API",
        parameters: [
          pathParam("id", "Document id"),
          { name: "versionNumber", in: "query", schema: { type: "integer" } },
          {
            name: "disposition",
            in: "query",
            schema: { type: "string", enum: ["attachment", "inline"] },
            description: "Use inline for API-proxied preview when signed storage URLs are unavailable.",
          },
        ],
        responses: { "200": { description: "File stream", content: { "application/octet-stream": {} } } },
      },
    },
    "/documents/{id}/metadata": {
      get: {
        tags: ["Documents"],
        summary: "Document record plus live object metadata from storage",
        parameters: [pathParam("id", "Document id")],
        responses: { "200": { description: "Metadata" } },
      },
    },
    "/documents/{id}/restore": {
      post: {
        tags: ["Documents"],
        summary: "Restore a document from trash",
        parameters: [pathParam("id", "Document id")],
        responses: { "200": { description: "Restored" }, "400": errorResponse("Not in trash") },
      },
    },
    "/documents/{id}/versions": {
      get: {
        tags: ["Documents"],
        summary: "List versions, newest first",
        parameters: [pathParam("id", "Document id")],
        responses: {
          "200": {
            description: "Versions",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    versions: { type: "array", items: { $ref: "#/components/schemas/DocumentVersion" } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Documents"],
        summary: "Add a new version",
        description:
          "Stored at `<basePrefix>/<tenantId>/<ownerId>/<documentId>/v<n>/<filename>`, alongside the " +
          "earlier versions of the same document. Returns 403 VERSIONING_DISABLED when the workspace " +
          "was created with versioning disabled.",
        parameters: [pathParam("id", "Document id")],
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: { file: { type: "string", format: "binary" }, filename: { type: "string" } },
              },
            },
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  filename: { type: "string" },
                  mimeType: { type: "string" },
                  size: { type: "integer" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Version created" },
          "403": errorResponse("Versioning disabled for this workspace, or no write access"),
        },
      },
    },

    "/documents/{id}/permissions": {
      get: {
        tags: ["Permissions"],
        summary: "Grants, the caller's effective access and the available levels",
        parameters: [pathParam("id", "Document id")],
        responses: {
          "200": {
            description: "Permissions",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    permissions: {
                      type: "array",
                      items: { $ref: "#/components/schemas/DocumentPermission" },
                    },
                    access: { $ref: "#/components/schemas/DocumentAccess" },
                    levels: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
          "403": errorResponse("Owner access required"),
        },
      },
      post: {
        tags: ["Permissions"],
        summary: "Grant or update access for a user or role",
        parameters: [pathParam("id", "Document id")],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["principalType", "principalId", "level"],
                properties: {
                  principalType: { type: "string", enum: ["user", "role"] },
                  principalId: { type: "string", example: "carlos@acme.com" },
                  level: { $ref: "#/components/schemas/PermissionLevel" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Existing grant updated" },
          "201": { description: "Grant created" },
          "403": errorResponse("Owner access required"),
        },
      },
    },
    "/documents/{id}/permissions/{permissionId}": {
      delete: {
        tags: ["Permissions"],
        summary: "Revoke a grant",
        parameters: [pathParam("id", "Document id"), pathParam("permissionId", "Grant id")],
        responses: {
          "204": { description: "Revoked" },
          "404": errorResponse("Grant not found"),
          "409": errorResponse("The document owner's access cannot be revoked"),
        },
      },
    },
  },
};

const swaggerSpec = swaggerJsdoc({ swaggerDefinition, apis: [] });

/**
 * The fully-resolved OpenAPI document. Exported so the shareable documentation
 * can be DERIVED from it (single source of truth for endpoints, parameters and
 * request payloads) instead of being hand-maintained in a parallel catalogue.
 */
export { swaggerSpec };

export function setupSwagger(app: Express): void {
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: "DMS API",
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: "none",
        tryItOutEnabled: true,
      },
    })
  );
  app.get("/api-docs.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });
}
