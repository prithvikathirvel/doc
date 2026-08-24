import Joi from "joi";

export const loginSchema = Joi.object({
  email: Joi.string().email().required().max(255),
  password: Joi.string().min(1).max(512).required(),
});

export const signupSchema = Joi.object({
  email: Joi.string().email().required().max(255),
  password: Joi.string().min(8).max(512).required(),
  username: Joi.string().allow("").max(255).optional(),
  firstName: Joi.string().allow("").max(255).optional(),
  lastName: Joi.string().allow("").max(255).optional(),
  phone: Joi.string().allow("").max(32).optional(),
  gender: Joi.string().allow("").max(32).optional(),
  address: Joi.string().allow("").max(512).optional(),
  additionalDetails: Joi.object().unknown(true).optional(),
  // DMS-local fields used when an administrator creates the account:
  tenantId: Joi.string().uuid().optional(),
  role: Joi.string().valid("tenant_admin", "member").optional(),
  claimAliases: Joi.array().items(Joi.string().min(1).max(255)).max(20).optional(),
});

export const addMemberSchema = Joi.object({
  email: Joi.string().email().optional(),
  userId: Joi.string().max(64).optional(),
  role: Joi.string().valid("tenant_admin", "member").optional(),
  claimAliases: Joi.array().items(Joi.string().min(1).max(255)).max(20).optional(),
})
  .xor("email", "userId")
  .required();

export const updateMemberSchema = Joi.object({
  role: Joi.string().valid("tenant_admin", "member").optional(),
  status: Joi.string().valid("active", "disabled").optional(),
})
  .or("role", "status")
  .required();

export const createApiKeySchema = Joi.object({
  displayName: Joi.string().min(1).max(100).required(),
  tenantId: Joi.string().uuid().allow(null).optional(),
  roles: Joi.array().items(Joi.string().valid("platform_admin", "tenant_admin", "member")).optional(),
  expiresAt: Joi.string().isoDate().allow(null).optional(),
});

export const updateApiKeySchema = Joi.object({
  status: Joi.string().valid("active", "disabled").required(),
});
