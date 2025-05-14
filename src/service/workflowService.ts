import { WorkflowRepository as MYSQLWorkflowRepository } from "../dao/mysql/workflowDao";
import { AuditLogger } from "../utils/audit";
import logger from "../utils/logger";
import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';
import { stageSchema, workflowSchema } from "../validator/createWorkflowSchema";

export class WorkflowService {
    private workflowRepository: MYSQLWorkflowRepository;

    constructor() {
        this.workflowRepository = new MYSQLWorkflowRepository();
    }

    //Workflow Services
    async createWorkflow(workflowData: any) {
        try {
            logger.info('WorkflowSeervice --> createWorkflow  --> data', workflowData);
            AuditLogger.logAction('createWorkflow', {workflowData});
            const { error } = workflowSchema.validate(workflowData);
            if (error) {
                throw createHttpError(StatusCodes.BAD_REQUEST, error.details[0].message);
            }
            const workflowName = workflowData.name.trim();
            const isExistingWorkflowPresent = await this.workflowRepository.findWorkflowByName(workflowName);
            if(isExistingWorkflowPresent) {
                throw createHttpError(StatusCodes.CONFLICT, `Workflow with the name '${workflowName}' already exists`)
            }
            await this.workflowRepository.createWorkflow(workflowData);
            return { code: 0, data: `Workflow with the name '${workflowName}' created Successfully`};
        } catch (error) {
            logger.error('WorkflowService --> createWorkflow  --> error', error);
            throw error;
        }
    }

    async getAllWorkflows() {
        try {
            logger.info('WorkflowService --> getAllWorkflows');
            const workflows = await this.workflowRepository.getAllWorkflows();
            return workflows;
        } catch (error) {
            logger.error('WorkflowService --> getAllWorkflows  --> error', error);
            throw error;
        }
    }

    async getWorkflowById(workflowId: string) {
        try {
            logger.info('WorkflowService --> getWorkflowById');
            const workflow = await this.workflowRepository.getWorkflowById(workflowId);
            return workflow;
        } catch (error) {
            logger.error('WorkflowService --> getWorkflowById  --> error', error);
            throw error;
        }
    }

    async updateWorkflowById(workflowId: string, updatedData: any) {
        try {
            logger.info('WorkflowService --> updateWorkflowById  --> data', updatedData);
            AuditLogger.logAction('updateWorkflowById', {updatedData});
            const { error } = workflowSchema.validate(updatedData);
            if (error) {
                throw createHttpError(StatusCodes.BAD_REQUEST, error.details[0].message);
            }
            updatedData.name = updatedData.name.trim();
            const isExistingWorkflowPresent = await this.workflowRepository.findWorkflowDuplicateName(workflowId, updatedData.name);
            if(isExistingWorkflowPresent) {
                throw createHttpError(StatusCodes.CONFLICT, `Workflow with the name '${updatedData.name}' already exists`)
            }
            await this.workflowRepository.updateWorkflowById(workflowId, updatedData);
            return {code: 0, message: 'Workflow updated successfully' };
        } catch (error) {
            logger.error('WorkflowService --> updateWorkflowById  --> error', error);
            throw error;
        }
    }

    async activateWorkflow(workflowId: string) {
        try {
            logger.info('WorkflowService --> getWorkflowById');
            const workflow = await this.workflowRepository.getWorkflowById(workflowId);
            if(workflow.length === 0) {
                throw createHttpError(StatusCodes.NOT_FOUND, `Workflow does not exists`)
            }
            const newStatus = !workflow.isActive;
            await this.workflowRepository.activateWorkflow(workflowId, newStatus);
            return newStatus ? { code: 0, message: 'Workflow enabled successfully' } : { code: 0, message: 'Workflow disabled successfully' };
        } catch (error) {
            logger.error('WorkflowService --> getWorkflowById  --> error', error);
            throw error;
        }
    }

    //Stage Services
    async createStage(stageData: any) {
        try {
            logger.info('WorkflowService --> createStage  --> data', stageData);
            AuditLogger.logAction('createStage', {stageData});
            const { error } = stageSchema.validate(stageData);
            if (error) {
                throw createHttpError(StatusCodes.BAD_REQUEST, error.details[0].message);
            }
            stageData.name = stageData.name.trim();
            const isStagePresent = await this.workflowRepository.findStageByName(stageData.name);
            if(isStagePresent) {
                throw createHttpError(StatusCodes.CONFLICT, `Stage with the name '${stageData.name} already exists`)
            }
            await this.workflowRepository.createStage(stageData);
            return {code: 0, message:`Stage with the name '${stageData.name} created successfully`}
        } catch (error) {
            logger.error('WorkflowService --> createWorkflow  --> error', error);
            throw error;
        }
    }

    async getAllStages() {
        try {
            logger.info('WorkflowService --> getAllStages');
            const stages = await this.workflowRepository.getAllStages();
            return stages;
        }
        catch (error: any) {
            logger.error('WorkflowService --> getStageById  --> error', error);
            throw error;
        }
    }

    async getStageById(stageId: string) {
        try {
            logger.info('WorkflowService --> getStageById  --> data', stageId);
            AuditLogger.logAction('getStageById', {stageId});
            const isStagePresentForId = await this.workflowRepository.getStageById(stageId);
            if(isStagePresentForId === null) {
                throw createHttpError(StatusCodes.CONFLICT, `Stage does not exists`);
            }
            return isStagePresentForId;
        }
        catch (error: any) {
            logger.error('WorkflowService --> getStageById  --> error', error);
            throw error;
        }
    }

    async updateStageById(stageId: string, updatedData: any) {
        try {
            logger.info('WorkflowService --> updateStageById  --> data', updatedData);
            AuditLogger.logAction('updateWorkflowById', {updatedData});
            const { error } = stageSchema.validate(updatedData);
            if (error) {
                throw createHttpError(StatusCodes.BAD_REQUEST, error.details[0].message);
            }
            const isStagePresent = await this.workflowRepository.getStageById(stageId);
            if(isStagePresent) {
                throw createHttpError(StatusCodes.NOT_FOUND, `Stage not found`);
            }
            const isDuplicateStage = await this.workflowRepository.findStageDuplicatName(stageId, updatedData.name);
            if(isDuplicateStage) {
                throw createHttpError(StatusCodes.CONFLICT, `Stage with the name '${updatedData.name} already exists`)
            }
            await this.workflowRepository.updateStageById(stageId, updatedData);
             return {code: 0, message: 'Stage updated successfully' };
        } catch (error) {
            logger.error('WorkflowService --> updateWorkflowById  --> error', error);
            throw error;
        }
    }

    async activateStage(stageId: string) {
        try {
            logger.info('WorkflowService --> activateStage');
            const stage = await this.workflowRepository.getStageById(stageId);
            if(stage.length === null) {
                throw createHttpError(StatusCodes.NOT_FOUND, `Stage does not exists`)
            }
            const newStatus = !stage.isActive;
            await this.workflowRepository.activateStage(stageId, newStatus);
            return newStatus ? { code: 0, message: 'Stage enabled successfully' } : { code: 0, message: 'Stage disabled successfully' };
        } catch (error) {
            logger.error('WorkflowService --> activateStage  --> error', error);
            throw error;
        }
    }
}
