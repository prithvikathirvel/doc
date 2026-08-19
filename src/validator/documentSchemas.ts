import Joi from "joi";

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

export const grantPermissionSchema = Joi.object({
  principalType: Joi.string().valid("user", "role").required(),
  principalId: Joi.string().required(),
  canRead: Joi.boolean(),
  canWrite: Joi.boolean(),
  canDelete: Joi.boolean(),
  canAdmin: Joi.boolean(),
});

export const createFolderSchema = Joi.object({
  name: Joi.string().max(255).required(),
  parentId: Joi.string().uuid().allow(null),
});

export const updateFolderSchema = Joi.object({
  name: Joi.string().max(255).required(),
});

export const createTenantSchema = Joi.object({
  name: Joi.string().max(255).required(),
  slug: Joi.string().max(100),
  maxFileSizeBytes: Joi.number().integer().min(1),
  allowedMimeTypes: Joi.array().items(Joi.string()).allow(null),
});

export const storageConfigSchema = Joi.object({
  provider: Joi.string().valid("s3", "minio", "gcp", "azure").required(),
  container: Joi.string().required(),
  region: Joi.string(),
  endpoint: Joi.string(),
  accessKeyRef: Joi.string(),
  secretKeyRef: Joi.string(),
  sessionTokenRef: Joi.string(),
  projectId: Joi.string(),
  accountName: Joi.string(),
  credentialsJsonRef: Joi.string(),
  basePrefix: Joi.string(),
  useSsl: Joi.boolean(),
  signedUrlTtlSeconds: Joi.number().integer().min(30).max(86400),
});
