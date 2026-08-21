import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Express } from "express";
import { settings } from "./config/settings";

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
      "In `AUTH_MODE=keycloak`, press **Authorize** and provide a signed Keycloak access token.",
      "Every authenticated request also needs `x-app-id: DMS`; tenant requests select a tenant with `x-tenant-id`.",
      "The old x-user-id/x-roles fields are available only in explicit header/dev mode.",
      "",
      "A platform administrator may omit `x-tenant-id` for platform endpoints, and sets it",
      "to the tenant it is operating on for everything else.",
      "",
      "Object layout in storage: `<basePrefix>/<tenantId>/<userId>/<documentId>/v<n>/<filename>`.",
    ].join("\n"),
  },
  servers: [{ url: settings.publicApiPath, description: "API base path" }],
  tags: [
    { name: "Authentication", description: "User Service login, refresh, logout and signup proxies" },
    { name: "Platform", description: "Health, metrics and sign-in helpers" },
    { name: "Tenants", description: "Onboarding, storage configuration, analytics and people" },
    { name: "Folders", description: "Folder tree, including recursive delete" },
    { name: "Documents", description: "Upload, download, versions and lifecycle" },
    { name: "Permissions", description: "Per-document access grants" },
  ],
  components: {
    securitySchemes: {
      appIdHeader: {
        type: "apiKey",
        in: "header",
        name: "x-app-id",
        description: "DMS application id. Must be exactly DMS in Keycloak mode.",
      },
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "RS256 Keycloak access token verified against the configured realm JWKS.",
      },
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
        description: "JWT identity token. Required only when the API runs with AUTH_DISABLED=false.",
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
      AuthLoginResponse: {
        type: "object",
        properties: {
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
          idToken: { type: "string", nullable: true },
          expiresIn: { type: "integer", example: 300 },
          refreshExpiresIn: { type: "integer", nullable: true },
          user: {
            type: "object",
            properties: {
              userId: { type: "string" },
              email: { type: "string" },
              displayName: { type: "string" },
            },
          },
          role: { type: "string", enum: ["platform_admin", "tenant_admin", "member"] },
          roles: { type: "array", items: { type: "string" } },
          tenants: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                slug: { type: "string" },
                status: { type: "string", enum: ["active", "suspended"] },
                role: { type: "string" },
              },
            },
          },
        },
      },
      AuthRefreshResponse: {
        type: "object",
        properties: {
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
          idToken: { type: "string", nullable: true },
          expiresIn: { type: "integer", example: 300 },
          refreshExpiresIn: { type: "integer", nullable: true },
        },
      },
      TenantMembership: {
        type: "object",
        properties: {
          id: uuid,
          tenantId: { type: "string" },
          userId: { type: "string" },
          email: { type: "string", nullable: true },
          role: { type: "string", enum: ["tenant_admin", "member"] },
          status: { type: "string", enum: ["active", "suspended"] },
          createdAt: dateTime,
          updatedAt: dateTime,
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
    { appIdHeader: [], bearerAuth: [] },
    { appIdHeader: [], userHeader: [], tenantHeader: [], rolesHeader: [], userNameHeader: [] },
    { idToken: [] },
  ],
  paths: {
    "/auth/login": {
      post: {
        tags: ["Authentication"],
        summary: "Authenticate with the Sify User Management Service",
        description:
          "DMS proxies this request server-side. The browser UI normally calls the public User Service login URL directly.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email", example: "priya@acme.com" },
                  password: { type: "string", format: "password", example: "secret" },
                },
              },
            },
          },
        },
        responses: {
          "200": jsonResponse("Tokens, profile, roles and tenant memberships", "AuthLoginResponse"),
          "400": errorResponse("Email or password is missing"),
          "401": errorResponse("Invalid credentials or invalid identity-provider token"),
        },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["Authentication"],
        summary: "Refresh the Keycloak access token",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["refreshToken"],
                properties: { refreshToken: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": jsonResponse("Refreshed tokens", "AuthRefreshResponse"),
          "401": errorResponse("Refresh token expired or rejected"),
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Authentication"],
        summary: "Invalidate a Keycloak refresh token",
        security: [],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  refreshToken: { type: "string" },
                  idToken: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "204": { description: "Logged out" } },
      },
    },
    "/auth/signup": {
      post: {
        tags: ["Authentication"],
        summary: "Create a User Management Service account",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password", "username"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", format: "password" },
                  username: { type: "string" },
                  firstName: { type: "string" },
                  lastName: { type: "string" },
                  phone: { type: "string" },
                  gender: { type: "string" },
                  address: { type: "string" },
                  additionalDetails: { type: "object", additionalProperties: true },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Account created" },
          "403": errorResponse("Public signup is disabled"),
          "422": errorResponse("User details are invalid"),
        },
      },
    },
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
        summary: "Resolve a workspace id or slug for the sign-in screen",
        description:
          "Returns the tenant behind a workspace slug and the roles the given user receives. " +
          "The registered owner email signs in as tenant_admin, everyone else as member.",
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
    "/tenants/mine": {
      get: {
        tags: ["Tenants"],
        summary: "List the authenticated user's DMS tenant memberships",
        description:
          "Returns active tenant_members rows joined to tenant metadata. Platform admins receive all tenants.",
        responses: {
          "200": {
            description: "Tenant memberships",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tenants: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          name: { type: "string" },
                          slug: { type: "string" },
                          status: { type: "string", enum: ["active", "suspended"] },
                          role: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": errorResponse("Bearer token missing or invalid"),
          "403": errorResponse("x-app-id missing or invalid"),
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
      post: {
        tags: ["Tenants"],
        summary: "Assign a User Service user to this DMS tenant",
        description:
          "Looks up the user, calls User Service POST /api/user-app-roles with appId DMS, then writes tenant_members.",
        parameters: [pathParam("id", "Tenant id")],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["roleId"],
                properties: {
                  userId: { type: "string" },
                  email: { type: "string", format: "email" },
                  roleId: { type: "string", description: "User Service role id" },
                  role: { type: "string", enum: ["member", "tenant_admin"] },
                },
              },
              example: {
                email: "priya@acme.com",
                roleId: "<member-role-id>",
                role: "member",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Membership created",
            content: {
              "application/json": {
                schema: { type: "object", properties: { membership: { $ref: "#/components/schemas/TenantMembership" } } },
              },
            },
          },
          "403": errorResponse("Tenant administrator role required"),
          "404": errorResponse("User or tenant not found"),
        },
      },
    },
    "/tenants/{id}/users/{userId}/role": {
      put: {
        tags: ["Tenants"],
        summary: "Change a user's User Service and DMS tenant role",
        parameters: [pathParam("id", "Tenant id"), pathParam("userId", "User Service user id")],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["roleId"],
                properties: {
                  roleId: { type: "string", description: "User Service role id" },
                  role: { type: "string", enum: ["member", "tenant_admin"] },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Role updated" },
          "403": errorResponse("Tenant administrator role required"),
          "404": errorResponse("Tenant membership not found"),
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
          "`<basePrefix>/<tenantId>/<userId>/<documentId>/v1/<filename>`.",
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
                  metadata: { type: "object", additionalProperties: true },
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
          "earlier versions of the same document.",
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
        responses: { "201": { description: "Version created" } },
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
