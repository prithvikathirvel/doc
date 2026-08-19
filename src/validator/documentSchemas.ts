import Joi from "joi";
import { PERMISSION_LEVELS } from "../utils/accessControl";
import { PROVIDERS } from "../service/storageConfig";

export const createDocumentSchema = Joi.object({
  name: Joi.string().max(255),
  filename: Joi.string().max(255).required(),
  mimeType: Joi.string().max(255),
  size: Joi.number().integer().min(0),
  folderId: Joi.string().uuid().allow(null),
  metadata: Joi.object().unknown(true),
  idempotencyKey: Joi.string().max(128),
});

export const completeUploadSchema = Joi.object({
  size: Joi.number().integer().min(0),
  checksum: Joi.string().max(128),
});

export const renameDocumentSchema = Joi.object({
  name: Joi.string().max(255).required(),
  folderId: Joi.string().uuid().allow(null),
});

export const createVersionSchema = Joi.object({
  name: Joi.string().max(255),
  filename: Joi.string().max(255),
  mimeType: Joi.string().max(255),
  size: Joi.number().integer().min(0),
});

/**
 * A grant is expressed as one named level. The individual capability flags stay
 * supported for API clients written against the previous contract.
 */
export const grantPermissionSchema = Joi.object({
  principalType: Joi.string().valid("user", "role").required().messages({
    "any.only": 'Principal type must be either "user" or "role"',
    "any.required": "Principal type is required",
  }),
  principalId: Joi.string().trim().max(255).required().messages({
    "string.empty": "Principal is required",
    "any.required": "Principal is required",
  }),
  level: Joi.string()
    .valid(...PERMISSION_LEVELS)
    .messages({ "any.only": `Access level must be one of: ${PERMISSION_LEVELS.join(", ")}` }),
  canRead: Joi.boolean(),
  canWrite: Joi.boolean(),
  canDelete: Joi.boolean(),
  canAdmin: Joi.boolean(),
})
  .or("level", "canRead", "canWrite", "canDelete", "canAdmin")
  .messages({ "object.missing": "An access level is required" });

export const createFolderSchema = Joi.object({
  name: Joi.string().max(255).required(),
  parentId: Joi.string().uuid().allow(null),
});

export const updateFolderSchema = Joi.object({
  name: Joi.string().max(255).required(),
});

/**
 * Storage payloads are provider-shaped: only the fields the selected provider uses
 * are accepted, and the mandatory ones are enforced here before the service runs
 * its semantic checks.
 */
export const storageConfigSchema = Joi.object({
  provider: Joi.string()
    .valid(...PROVIDERS)
    .required()
    .messages({ "any.only": `Storage provider must be one of: ${PROVIDERS.join(", ")}` }),
  container: Joi.string().trim().max(255).required().messages({
    "string.empty": "Bucket or container name is required",
    "any.required": "Bucket or container name is required",
  }),
  basePrefix: Joi.string().trim().max(255).allow("", null),
  signedUrlTtlSeconds: Joi.number().integer().min(60).max(86400),

  region: Joi.string()
    .trim()
    .max(100)
    .allow("", null)
    .when("provider", {
      is: "s3",
      then: Joi.string().trim().max(100).required().messages({
        "string.empty": "AWS region is required",
        "any.required": "AWS region is required",
      }),
    })
    .when("provider", { is: Joi.valid("gcp", "azure"), then: Joi.forbidden() }),

  endpoint: Joi.string()
    .trim()
    .max(500)
    .allow("", null)
    .when("provider", {
      is: "minio",
      then: Joi.string().trim().max(500).required().messages({
        "string.empty": "MinIO endpoint URL is required",
        "any.required": "MinIO endpoint URL is required",
      }),
    })
    .when("provider", { is: "gcp", then: Joi.forbidden() }),

  useSsl: Joi.boolean().when("provider", { is: Joi.valid("gcp", "azure"), then: Joi.forbidden() }),

  accessKeyRef: Joi.string()
    .trim()
    .max(255)
    .allow("", null)
    .when("provider", {
      is: "minio",
      then: Joi.string().trim().max(255).required().messages({
        "string.empty": "Access key reference is required",
        "any.required": "Access key reference is required",
      }),
    })
    .when("provider", { is: Joi.valid("gcp", "azure"), then: Joi.forbidden() }),

  secretKeyRef: Joi.string()
    .trim()
    .max(255)
    .allow("", null)
    .when("provider", {
      is: Joi.valid("minio", "azure"),
      then: Joi.string().trim().max(255).required().messages({
        "string.empty": "Secret or account key reference is required",
        "any.required": "Secret or account key reference is required",
      }),
    })
    .when("provider", { is: "gcp", then: Joi.forbidden() }),

  sessionTokenRef: Joi.string()
    .trim()
    .max(255)
    .allow("", null)
    .when("provider", { is: Joi.not("s3"), then: Joi.forbidden() }),

  projectId: Joi.string()
    .trim()
    .max(255)
    .allow("", null)
    .when("provider", {
      is: "gcp",
      then: Joi.string().trim().max(255).required().messages({
        "string.empty": "Google Cloud project ID is required",
        "any.required": "Google Cloud project ID is required",
      }),
      otherwise: Joi.forbidden(),
    }),

  credentialsJsonRef: Joi.string()
    .trim()
    .max(255)
    .allow("", null)
    .when("provider", { is: Joi.not("gcp"), then: Joi.forbidden() }),

  accountName: Joi.string()
    .trim()
    .max(255)
    .allow("", null)
    .when("provider", {
      is: "azure",
      then: Joi.string().trim().max(255).required().messages({
        "string.empty": "Storage account name is required",
        "any.required": "Storage account name is required",
      }),
      otherwise: Joi.forbidden(),
    }),
}).messages({
  "any.unknown": "{{#label}} is not used by the selected storage provider",
});

export const createTenantSchema = Joi.object({
  name: Joi.string().trim().max(255).required().messages({
    "string.empty": "Tenant name is required",
    "any.required": "Tenant name is required",
  }),
  slug: Joi.string().trim().max(100).allow("", null),
  ownerName: Joi.string().trim().max(255).allow("", null),
  ownerEmail: Joi.string().trim().max(255).allow("", null),
  maxFileSizeBytes: Joi.number().integer().min(1024),
  allowedMimeTypes: Joi.array().items(Joi.string().trim().max(255)).allow(null),
  storage: storageConfigSchema,
});

export const updateTenantSchema = Joi.object({
  name: Joi.string().trim().max(255),
  status: Joi.string().valid("active", "suspended"),
  ownerName: Joi.string().trim().max(255).allow("", null),
  ownerEmail: Joi.string().trim().max(255).allow("", null),
  maxFileSizeBytes: Joi.number().integer().min(1024),
  allowedMimeTypes: Joi.array().items(Joi.string().trim().max(255)).allow(null),
}).min(1);

export const resolveWorkspaceSchema = Joi.object({
  workspace: Joi.string().trim().max(255).required().messages({
    "string.empty": "Workspace name is required",
    "any.required": "Workspace name is required",
  }),
  user: Joi.string().trim().max(255).allow("", null),
});
