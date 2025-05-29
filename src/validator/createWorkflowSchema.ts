import Joi from 'joi';


export const nextPossibleActionsSchema = Joi.array().items(Joi.object({
    id: Joi.string().required(),
    stageName: Joi.string().required()
}));

export const workflowStageSchema = Joi.object({
    id: Joi.string(),
    name: Joi.string().required(),
    isStart: Joi.boolean(),
    isEnd: Joi.boolean(),
    status: Joi.string().required(),
    isDecision: Joi.boolean(),
    isRequest: Joi.boolean(),
    inputSchema: Joi.object(),
    allowedRoles: Joi.array().items(Joi.string()),
    allowedUsers: Joi.array().items(Joi.string()),
    actionType: Joi.string().valid('static', 'handler').required(),
    handlerFunction: Joi.string().when('actionType', { is: 'handler', then: Joi.required() }),
    specification: Joi.object(),
    nextPossibleActions: nextPossibleActionsSchema.optional()
});

export const workflowSchema = Joi.object({
    id: Joi.string(),
    name: Joi.string().required(),
    descriptiom: Joi.string().allow('', null),
    stages: Joi.array().items(workflowStageSchema).required(),
    isActive: Joi.boolean().required()
})

export const stageSchema = Joi.object({
    id: Joi.string(),
    name: Joi.string().required(),
    isActive: Joi.boolean().required()
});

export const createWorkflowInstanceSchema = Joi.object({
    workflowId: Joi.string().required(),
    assetId: Joi.string().required(),
    type: Joi.string().required(),
    stageId: Joi.string(),
    instanceId: Joi.string()
});