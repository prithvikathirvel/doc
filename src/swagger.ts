import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Express } from "express";

const swaggerDefinition: swaggerJsdoc.OAS3Definition = {
  openapi: "3.0.0",
  info: {
    title: "Document Service API",
    version: "1.0.0",
    description:
      "Cloud-agnostic Document Management System — file storage (MinIO), metadata (MySQL), and workflow engine.",
  },
  servers: [
    {
      url: "http://localhost:{port}/api",
      description: "Local development server",
      variables: {
        port: { default: "3000" },
      },
    },
  ],
  components: {
    securitySchemes: {
      idToken: {
        type: "apiKey",
        in: "header",
        name: "idtoken",
        description: "JWT identity token (decoded for user info)",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          message: { type: "string" },
          error: { type: "string" },
        },
      },
      Workflow: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          description: { type: "string" },
          isActive: { type: "boolean" },
          stages: {
            type: "array",
            items: { $ref: "#/components/schemas/WorkflowStage" },
          },
          user_id: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          createdBy: { type: "string" },
          updatedAt: { type: "string", format: "date-time" },
          updatedBy: { type: "string" },
        },
      },
      WorkflowStage: {
        type: "object",
        required: ["name", "status"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          nodeType: { type: "string" },
          status: { type: "string" },
          allowedRoles: { type: "array", items: { type: "string" } },
          allowedUsers: { type: "array", items: { type: "string" } },
          actionType: { type: "string", enum: ["static", "handler"] },
          staticSpecification: { type: "array", items: { type: "object" } },
          handlerSpecification: { type: "object" },
          inputSchema: { type: "object" },
          nextPossibleActions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                stageName: { type: "string" },
              },
            },
          },
        },
      },
      CreateWorkflow: {
        type: "object",
        required: ["name", "stages", "isActive"],
        properties: {
          name: { type: "string", example: "Document Review" },
          description: { type: "string", example: "Standard document review pipeline" },
          isActive: { type: "boolean", example: true },
          stages: {
            type: "array",
            items: { $ref: "#/components/schemas/WorkflowStage" },
          },
        },
      },
      Stage: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          isActive: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          createdBy: { type: "string" },
          updatedAt: { type: "string", format: "date-time" },
          updatedBy: { type: "string" },
        },
      },
      CreateStage: {
        type: "object",
        required: ["name", "isActive"],
        properties: {
          name: { type: "string", example: "Review" },
          isActive: { type: "boolean", example: true },
        },
      },
      UpdateStage: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", example: "Approval" },
        },
      },
      WorkflowInstance: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          workflowId: { type: "string" },
          assetId: { type: "string" },
          type: { type: "string" },
          currentStageId: { type: "string" },
          status: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      CreateWorkflowInstance: {
        type: "object",
        required: ["workflowId", "assetId", "type"],
        properties: {
          workflowId: { type: "string", example: "uuid-of-workflow" },
          assetId: { type: "string", example: "uuid-of-document" },
          type: { type: "string", example: "documents" },
        },
      },
      UpdateWorkflowInstance: {
        type: "object",
        required: ["workflowId", "assetId", "type"],
        properties: {
          workflowId: { type: "string" },
          assetId: { type: "string" },
          type: { type: "string" },
          stageId: { type: "string", description: "Target stage ID for transition" },
        },
      },
      Handler: {
        type: "object",
        properties: {
          handlerName: { type: "string" },
          handlerFunctionName: { type: "string" },
          handlerDescription: { type: "string" },
          inputParams: { type: "array", items: { type: "object" } },
        },
      },
      ExecuteHandler: {
        type: "object",
        required: ["handlerFunctionName", "inputParams"],
        properties: {
          handlerFunctionName: {
            type: "string",
            enum: ["updateStatus", "sendEmail", "spellCheck"],
            example: "updateStatus",
          },
          inputParams: {
            type: "object",
            properties: {
              entityType: { type: "string", example: "documents" },
              id: { type: "string" },
              status: { type: "string" },
            },
          },
        },
      },
      DocumentMetadata: {
        type: "object",
        properties: {
          id: { type: "integer" },
          fileName: { type: "string" },
          fileSize: { type: "integer" },
          mimeType: { type: "string" },
          storageType: { type: "string" },
          uploadedAt: { type: "string", format: "date-time" },
          uploadedBy: { type: "string" },
          additionalMetadata: { type: "object" },
          workflowRequests: { type: "object" },
          suggestedTags: { type: "string" },
          suggestedDescription: { type: "string" },
        },
      },
    },
  },
  paths: {
    "/files/upload": {
      post: {
        tags: ["Files"],
        summary: "Upload a file",
        security: [{ idToken: [] }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: {
                  file: { type: "string", format: "binary" },
                  directory: { type: "string", description: "Target directory path" },
                  userName: { type: "string" },
                  metadata: {
                    type: "string",
                    description: "JSON string with title, description, tags etc.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "File uploaded successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                    result: { type: "object" },
                  },
                },
              },
            },
          },
          "400": { description: "File not uploaded" },
          "401": { description: "Unauthorized" },
          "500": { description: "Internal server error" },
        },
      },
    },
    "/files/download/{path}": {
      get: {
        tags: ["Files"],
        summary: "Download a file by path",
        parameters: [
          {
            name: "path",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "File path in storage (catch-all)",
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  remotePath: { type: "string" },
                  userDirectory: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "File downloaded successfully" },
          "500": { description: "Failed to download file" },
        },
      },
    },
    "/files/downloadDocument": {
      get: {
        tags: ["Files"],
        summary: "Stream download a document directly from MinIO",
        security: [{ idToken: [] }],
        parameters: [
          {
            name: "assetId",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Document asset ID",
          },
        ],
        responses: {
          "200": {
            description: "File stream (application/pdf)",
            content: { "application/pdf": { schema: { type: "string", format: "binary" } } },
          },
          "404": { description: "Document not found" },
          "500": { description: "Failed to download" },
        },
      },
    },
    "/files/documentDetails/{assetId}": {
      get: {
        tags: ["Files"],
        summary: "Get document metadata by asset ID",
        security: [{ idToken: [] }],
        parameters: [
          {
            name: "assetId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Document details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DocumentMetadata" },
              },
            },
          },
          "404": { description: "Document not found" },
          "500": { description: "Internal server error" },
        },
      },
    },
    "/files/delete-file": {
      delete: {
        tags: ["Files"],
        summary: "Permanently delete a file",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["directory", "fileName"],
                properties: {
                  directory: { type: "string", example: "user123/docs" },
                  fileName: { type: "string", example: "report.pdf" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "File deleted successfully" },
          "500": { description: "Failed to delete file" },
        },
      },
    },
    "/files/delete-directory": {
      delete: {
        tags: ["Files"],
        summary: "Delete an entire directory and its contents",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["directory"],
                properties: {
                  directory: { type: "string", example: "user123/temp" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Directory deleted successfully" },
          "500": { description: "Failed to delete directory" },
        },
      },
    },
    "/files/user/{userName}": {
      get: {
        tags: ["Files"],
        summary: "Get user directory tree structure",
        parameters: [
          {
            name: "userName",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Hierarchical directory tree",
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
              },
            },
          },
          "400": { description: "User name is required" },
          "500": { description: "Failed to retrieve file tree" },
        },
      },
    },
    "/files/allFiles": {
      post: {
        tags: ["Files"],
        summary: "List all files and directories with filters and sorting",
        parameters: [
          { name: "userName", in: "query", required: true, schema: { type: "string" } },
          { name: "name", in: "query", schema: { type: "string" }, description: "Filter by file name" },
          { name: "tag", in: "query", schema: { type: "string" }, description: "Filter by tag" },
          { name: "metadata", in: "query", schema: { type: "string" }, description: "Filter by metadata" },
          { name: "sortBy", in: "query", schema: { type: "string", enum: ["name", "date"] } },
          { name: "sortOrder", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
        ],
        responses: {
          "200": {
            description: "Hierarchical file structure with metadata",
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
              },
            },
          },
          "400": { description: "userName is required" },
          "500": { description: "Failed to list files" },
        },
      },
    },
    "/files/allFiles/{assetId}": {
      put: {
        tags: ["Files"],
        summary: "Update document metadata",
        parameters: [
          {
            name: "assetId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                description: "Fields to update (fileName, tags, description, etc.)",
                additionalProperties: true,
              },
            },
          },
        },
        responses: {
          "200": { description: "Document updated successfully" },
          "500": { description: "Failed to update document" },
        },
      },
    },
    "/files/rename": {
      post: {
        tags: ["Files"],
        summary: "Rename a file or directory",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["userName", "oldPath", "newPath"],
                properties: {
                  userName: { type: "string", example: "user123" },
                  oldPath: { type: "string", example: "docs/old-name.pdf" },
                  newPath: { type: "string", example: "docs/new-name.pdf" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Rename successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                    data: {
                      type: "object",
                      properties: {
                        userName: { type: "string" },
                        oldPath: { type: "string" },
                        newPath: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": { description: "Validation error" },
          "500": { description: "Failed to rename" },
        },
      },
    },
    "/files/delete/soft": {
      post: {
        tags: ["Files"],
        summary: "Soft-delete a document (marks as deleted in DB)",
        parameters: [
          {
            name: "documentId",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Delete successful" },
          "404": { description: "Document not found" },
          "500": { description: "Server error" },
        },
      },
    },
    "/files/restore": {
      post: {
        tags: ["Files"],
        summary: "Restore a soft-deleted document",
        parameters: [
          {
            name: "documentId",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Restore successful" },
          "404": { description: "Document not found" },
          "500": { description: "Server error" },
        },
      },
    },
    "/workflow": {
      post: {
        tags: ["Workflows"],
        summary: "Create a new workflow",
        security: [{ idToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateWorkflow" },
            },
          },
        },
        responses: {
          "201": { description: "Workflow created" },
          "400": { description: "Validation error" },
          "401": { description: "Unauthorized" },
          "500": { description: "Internal server error" },
        },
      },
      get: {
        tags: ["Workflows"],
        summary: "Get all workflows",
        security: [{ idToken: [] }],
        responses: {
          "200": {
            description: "List of workflows",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Workflow" } },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "500": { description: "Internal server error" },
        },
      },
    },
    "/workflow/{workflowId}": {
      get: {
        tags: ["Workflows"],
        summary: "Get workflow by ID",
        security: [{ idToken: [] }],
        parameters: [
          { name: "workflowId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Workflow details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Workflow" },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "404": { description: "Workflow not found" },
          "500": { description: "Internal server error" },
        },
      },
      put: {
        tags: ["Workflows"],
        summary: "Update a workflow",
        security: [{ idToken: [] }],
        parameters: [
          { name: "workflowId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateWorkflow" },
            },
          },
        },
        responses: {
          "200": { description: "Workflow updated" },
          "401": { description: "Unauthorized" },
          "404": { description: "Workflow not found" },
          "500": { description: "Internal server error" },
        },
      },
      patch: {
        tags: ["Workflows"],
        summary: "Activate or deactivate a workflow",
        security: [{ idToken: [] }],
        parameters: [
          { name: "workflowId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Workflow activation toggled" },
          "401": { description: "Unauthorized" },
          "404": { description: "Workflow not found" },
          "500": { description: "Internal server error" },
        },
      },
    },
    "/stages": {
      post: {
        tags: ["Stages"],
        summary: "Create a new stage",
        security: [{ idToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateStage" },
            },
          },
        },
        responses: {
          "201": { description: "Stage created" },
          "400": { description: "Validation error" },
          "401": { description: "Unauthorized" },
          "500": { description: "Internal server error" },
        },
      },
      get: {
        tags: ["Stages"],
        summary: "Get all stages",
        security: [{ idToken: [] }],
        responses: {
          "200": {
            description: "List of stages",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Stage" } },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "500": { description: "Internal server error" },
        },
      },
    },
    "/stages/{stageId}": {
      get: {
        tags: ["Stages"],
        summary: "Get stage by ID",
        security: [{ idToken: [] }],
        parameters: [
          { name: "stageId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Stage details",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Stage" } },
            },
          },
          "401": { description: "Unauthorized" },
          "404": { description: "Stage not found" },
          "500": { description: "Internal server error" },
        },
      },
      put: {
        tags: ["Stages"],
        summary: "Update a stage",
        security: [{ idToken: [] }],
        parameters: [
          { name: "stageId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateStage" },
            },
          },
        },
        responses: {
          "200": { description: "Stage updated" },
          "401": { description: "Unauthorized" },
          "404": { description: "Stage not found" },
          "500": { description: "Internal server error" },
        },
      },
      patch: {
        tags: ["Stages"],
        summary: "Activate or deactivate a stage",
        security: [{ idToken: [] }],
        parameters: [
          { name: "stageId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Stage activation toggled" },
          "401": { description: "Unauthorized" },
          "404": { description: "Stage not found" },
          "500": { description: "Internal server error" },
        },
      },
      delete: {
        tags: ["Stages"],
        summary: "Delete a stage",
        security: [{ idToken: [] }],
        parameters: [
          { name: "stageId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Stage deleted" },
          "401": { description: "Unauthorized" },
          "404": { description: "Stage not found" },
          "500": { description: "Internal server error" },
        },
      },
    },
    "/instances": {
      post: {
        tags: ["Workflow Instances"],
        summary: "Create a workflow instance (assign workflow to a document)",
        security: [{ idToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateWorkflowInstance" },
            },
          },
        },
        responses: {
          "201": {
            description: "Workflow instance created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WorkflowInstance" },
              },
            },
          },
          "400": { description: "Validation error" },
          "401": { description: "Unauthorized" },
          "500": { description: "Internal server error" },
        },
      },
    },
    "/instances/{workflowInstanceId}": {
      put: {
        tags: ["Workflow Instances"],
        summary: "Update/transition a workflow instance to next stage",
        security: [{ idToken: [] }],
        parameters: [
          {
            name: "workflowInstanceId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["workflowId", "assetId", "type"],
                properties: {
                  workflowId: { type: "string" },
                  assetId: { type: "string" },
                  type: { type: "string" },
                  stageId: { type: "string", description: "Target stage ID" },
                  document: { type: "string", format: "binary", description: "Optional document upload during transition" },
                  directory: { type: "string" },
                  userName: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Instance updated / transitioned" },
          "400": { description: "Validation error" },
          "401": { description: "Unauthorized" },
          "500": { description: "Internal server error" },
        },
      },
    },
    "/handler": {
      post: {
        tags: ["Handlers"],
        summary: "Execute a handler action",
        security: [{ idToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ExecuteHandler" },
            },
          },
        },
        responses: {
          "200": {
            description: "Handler executed successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { message: { type: "string" } },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "500": { description: "Internal server error" },
        },
      },
      get: {
        tags: ["Handlers"],
        summary: "Get all available handlers",
        security: [{ idToken: [] }],
        responses: {
          "200": {
            description: "List of available handler definitions",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Handler" } },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "500": { description: "Internal server error" },
        },
      },
    },
  },
};

const swaggerSpec = swaggerJsdoc({
  swaggerDefinition,
  apis: [],
});

export function setupSwagger(app: Express): void {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/api-docs.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });
}
