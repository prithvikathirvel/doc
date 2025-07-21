import Joi from "joi";

export const nextPossibleActionsSchema = Joi.array().items(
  Joi.object({
    id: Joi.string().required(),
    stageName: Joi.string().required(),
  })
);

export const workflowStageSchema = Joi.object({
  id: Joi.string(),
  name: Joi.string().required(),
  nodeType: Joi.string().optional(),
  status: Joi.string().required(),
  allowedRoles: Joi.array().items(Joi.string()),
  allowedUsers: Joi.array().items(Joi.string()),
  actionType: Joi.string().valid("static", "handler").optional(),

  handlerFunction: Joi.string().when("actionType", {
    is: "handler",
    then: Joi.required(),
  }),

  staticSpecification: Joi.when("actionType", {
    is: "static",
    then: Joi.array().items(Joi.object()).required(),
    otherwise: Joi.forbidden(),
  }),

  handlerSpecification: Joi.when("actionType", {
    is: "handler",
    then: Joi.object().required(),
    otherwise: Joi.forbidden(),
  }),

  inputSchema: Joi.object().optional(),
  nextPossibleActions: nextPossibleActionsSchema.optional(),
});

export const workflowSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow("", null),
  stages: Joi.array().items(workflowStageSchema).required(),
  isActive: Joi.boolean().required(),
});

export const stageSchema = Joi.object({
  name: Joi.string().required(),
  isActive: Joi.boolean().required(),
});

export const updateStageSchema = Joi.object({
  name: Joi.string().required(),
});

export const createWorkflowInstanceSchema = Joi.object({
  workflowId: Joi.string().required(),
  assetId: Joi.string().required(),
  type: Joi.string().required(),
  requestedData: Joi.object().required(),
});

export const inputDataSchema = Joi.object({
  currentStageInput: Joi.object().unknown(true).optional(),
  nextStageHandlerInput: Joi.any().optional(),
});

export const updateWorkflowInstanceSchema = Joi.object({
  workflowId: Joi.string().required(),
  assetId: Joi.string().required(),
  type: Joi.string().required(),
  stageId: Joi.string(),
  inputData: inputDataSchema.optional(),
});
