import { WorkflowRepository as MYSQLWorkflowRepository } from "../dao/mysql/workflowDao";
import { AuditLogger } from "../utils/audit";
import logger from "../utils/logger";
import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';
import { createWorkflowInstanceSchema, stageSchema, updateWorkflowInstanceSchema, workflowSchema } from "../validator/createWorkflowSchema";
import moment from "moment";

export class WorkflowService {
    private workflowRepository: MYSQLWorkflowRepository;

    constructor() {
        this.workflowRepository = new MYSQLWorkflowRepository();
    }

    handlerFunctions: any = {
        'createSummary': this.updateMetadata,
        'endWorkflowHandler': this.endWorkflowInstance,
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
            return workflows.map((workflow: any) => {
                 return {...workflow, isActive: workflow.isActive === 1}
            });
        } catch (error) {
            logger.error('WorkflowService --> getAllWorkflows  --> error', error);
            throw error;
        }
    }

    async getWorkflowById(workflowId: string) {
        try {
            logger.info('WorkflowService --> getWorkflowById');
            const workflow = await this.workflowRepository.getWorkflowById(workflowId);
            if(workflow.length === 0) {
                throw createHttpError(StatusCodes.NOT_FOUND, `Workflow does not exists`)
            }
            return workflow.map((workflow: any) => {
                return {...workflow, isActive: workflow.isActive === 1}
            });
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
      
            const newStatus = !(workflow[0].isActive === 1);
         
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
                throw createHttpError(StatusCodes.CONFLICT, `Stage with the name '${stageData.name}' already exists`)
            }
            await this.workflowRepository.createStage(stageData);
            return {code: 0, message:`Stage with the name '${stageData.name}' created successfully`}
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
            if(!isStagePresent) {
                throw createHttpError(StatusCodes.NOT_FOUND, `Stage not found`);
            }
            const isDuplicateStage = await this.workflowRepository.findStageDuplicatName(stageId, updatedData.name);
            
            if(isDuplicateStage) {
                throw createHttpError(StatusCodes.CONFLICT, `Stage with the name '${updatedData.name}' already exists`)
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
      
            const newStatus = !(stage[0].isActive === 1);
            await this.workflowRepository.activateStage(stageId, newStatus);

            return newStatus ? { code: 0, message: 'Stage enabled successfully' } : { code: 0, message: 'Stage disabled successfully' };
        } catch (error) {
            logger.error('WorkflowService --> activateStage  --> error', error);
            throw error;
        }
    }

    async getAsset(assetId: any, type: any) {
        try {
            logger.info('WorkflowService --> getAsset --> assetId', assetId);
            const documentData = await this.workflowRepository.getAssetDataByTypeAndId(assetId, type);
            if (!documentData) {
                throw createHttpError(StatusCodes.NOT_FOUND, 'Asset not found');
            }
            return documentData;
        } catch (error) {
            logger.error('WorkflowService --> getWorkflowDefinition  --> error', error);
            throw error;
        }
    }

    async getWorkflowDefinition(workflowId: string) {
        try {
            logger.info('WorkflowService --> getWorkflowDefinition --> id',workflowId);
            const workflowDefinition = await this.workflowRepository.getWorkflowById(workflowId);
            return workflowDefinition;
        } catch (error) {
            logger.error('WorkflowService --> getWorkflowDefinition  --> error', error);
            throw error;
        }
    }

    async findStartStage(stages: any) {
        try {
            logger.info('WorkflowService --> findStartStage --> stages',stages);
            const startStage = stages.find((stage: any) => stage.isStart === true);
            if (!startStage) {
                throw new Error('No start stage defined in the workflow');
            }
            return startStage;
        } catch (error) {
            logger.error('WorkflowService --> findStartStage  --> error', error);
            throw error;
        }
    }

    async getAllowedRolesAndUsers(nextStages: any, stages: any) {
        try {
            logger.info('WorkflowService --> getAllowedRolesAndUsers --> nextStages',nextStages);
            const currentAllowedRoles = nextStages?.flatMap((action: any) => {
                const matchingStage = stages?.find((stage: any) => stage.id === action.id);
                return matchingStage?.allowedRoles || [];
            }) || [];
            const currentAllowedUsers = nextStages?.nextPossibleActions?.flatMap((action: any) => {
                const matchingStage = stages?.stages?.find((stage: any) => stage.id === action.id);
                return matchingStage?.allowedUsers || [];
            }) || [];
            return { currentAllowedRoles, currentAllowedUsers };
        } catch (error) {
            logger.error('WorkflowService --> getAllowedRolesAndUsers  --> error', error);
            throw error;
        }
    }

    async createInstanceData(assetId: any, type: any, workflowId: any, workflowName: any, startStage: any, user_id: any, user: any, currentAllowedRoles: any, currentAllowedUsers: any) {
        try {
            logger.info('WorkflowService --> createInstanceData --> stages', assetId);
            return {
                workflowId,
                workflowName,
                currentStage: startStage.name,
                status: startStage.status,
                possibleActions: startStage.nextPossibleActions,
                currentAllowedRoles,
                currentAllowedUsers,
                assetId,
                assetType: type,
                requestedBy: 'admin',
                user_id,
                history: [{
                    stageId: startStage.id,
                    stageName: startStage.name,
                    performedBy: 'admin',
                    timestamp: moment().format('YYYY-MM-DD HH:mm:ss')
                }],
                createdAt: moment().format('YYYY-MM-DD HH:mm:ss'),
            };
        } catch (error) {
            logger.error('WorkflowService --> createInstanceData  --> error', error);
            throw error;
        }
    }

    async updateAssetWithSuggestedMetadata(type: any, id: any, assetData: any, newWorkflowRequest: any) {
        try {
            logger.info('WorkflowService --> updateAssetWithSuggestedMetadata --> id', id);
            const requestedData = newWorkflowRequest?.requestedData;
            delete newWorkflowRequest?.requestedData;
            if (!assetData.workflowRequests) {
                assetData.workflowRequests = [newWorkflowRequest];
            } else {
                const index = assetData.workflowRequests.findIndex(
                    (item: any) => item.instanceId === newWorkflowRequest.instanceId
                );

                if (index !== -1) {
                    assetData.workflowRequests[index] = {
                        ...assetData.workflowRequests[index],
                        requestedData: requestedData ? requestedData : assetData?.workflowRequests?.[index]?.requestedData || {},
                        ...newWorkflowRequest
                    };
                } else {
                    assetData.workflowRequests.push(newWorkflowRequest);
                }
            }
            await this.workflowRepository.updateSuggestedAssetData(type, id, assetData.workflowRequests);
        } catch (error) {
            console.error('workflowService --> updateAssetWithSuggestedMetadata --> error ::', error);
            throw error;
        }
    }

    //WorkflowInstanceServices
    async createWorkflowInstance(workflowInstanceData: any) {
        try {
            logger.info('WorkflowService --> createWorkflowInstance  --> data', workflowInstanceData);
            AuditLogger.logAction('createWorkflowInstance', {workflowInstanceData});
            const { error } = createWorkflowInstanceSchema.validate(workflowInstanceData);
            if (error) {
                throw createHttpError(StatusCodes.BAD_REQUEST, error.details[0].message);
            }
            const { assetId, workflowId, user_id, type, user } = workflowInstanceData;
            const workflowDefinition = await this.getWorkflowDefinition(workflowId);
            const assetData = await this.getAsset(assetId, type);
     
            const startStage = await this.findStartStage(workflowDefinition[0].stages);
            const { currentAllowedRoles, currentAllowedUsers } = await this.getAllowedRolesAndUsers(startStage?.nextPossibleActions, workflowDefinition[0]?.stages);
            const instanceData = await this.createInstanceData(assetId, type, workflowId, workflowDefinition[0].name, startStage, user_id, user, currentAllowedRoles, currentAllowedUsers);
            const newInstance = await this.workflowRepository.addWorkflowInstance(instanceData);
            const newWorkflowRequest = {
                instanceId: newInstance.id,
                workflowId,
                workflowName: workflowDefinition[0].name,
                currentStage: startStage.name,
                status: startStage.status,
                possibleActions: startStage.nextPossibleActions,
                currentAllowedRoles: currentAllowedRoles,
                currentAllowedUsers: currentAllowedUsers,
                requestedBy: user,
                user_id: 'user1',
                requestedAt: moment().format('YYYY-MM-DD HH:mm:ss')
            };
            await this.updateAssetWithSuggestedMetadata(type, assetId, assetData, newWorkflowRequest);
            return {
                message: 'Workflow instance created successfully',
                data: newInstance
            };
        } catch (error) {
            logger.error('WorkflowService --> createWorkflowInstance  --> error', error);
            throw error;
        }
    }

    async getWorkflowInstance(instanceId: any) {
     
        try {
            logger.info('WorkflowService --> getWorkflowInstance  --> instanceId', instanceId);
            AuditLogger.logAction('getWorkflowInstance', {instanceId});
            const workflowInstanceData = await this.workflowRepository.getWorkflowInstanceById(instanceId);
           
            if (!workflowInstanceData) {
                throw createHttpError(StatusCodes.NOT_FOUND, 'Workflow instance not found');
            }
            return workflowInstanceData;
        } catch (error) {
            logger.error('WorkflowService --> getWorkflowInstance  --> error', error);
            throw error;
        }
    }
    
    async getAllWorkflowInstances(data: any) {
         try {
            logger.info('WorkflowService --> getAllWorkflowInstances  --> data', data);
            AuditLogger.logAction('getAllWorkflowInstances', {data});
            const { user_id } = data;
            const role = await this.workflowRepository.getRoleByUserId(user_id);
            if (!role) {
                throw createHttpError(StatusCodes.NOT_FOUND, 'User not found');
            }
            const workflowInstances = await this.workflowRepository.getAllWorkflowInstanceByUser(role, user_id);
            return workflowInstances;
        } catch (error) {
            logger.error('WorkflowService --> getWorkflowInstance  --> error', error);
            throw error;
        }
    }

    async endWorkflowInstance(data: any) {
         try {
            logger.info('WorkflowService --> endWorkflowInstance  --> data', data);
            AuditLogger.logAction('endWorkflowInstance', {data});
            const { instanceId, assetId, type } = data;
            const assetData = await this.workflowRepository.getAssetDataByTypeAndId(assetId, type);
            if (!assetData) {
                throw createHttpError(StatusCodes.NOT_FOUND, 'Asset not found');
            }
            assetData.workflowRequests = assetData.workflowRequests.filter(
                (request: any) => request.instanceId !== instanceId
            );
            await this.workflowRepository.updateSuggestedAssetData(type, assetId, assetData.workflowRequests);
        } catch (error) {
            logger.error('WorkflowService --> endWorkflowInstance  --> error', error);
            throw error;
        }
    }

    async findNextStageById(stages: any, stageId: any) {
         try {
            logger.info('WorkflowService --> findNextStageById  --> data', stageId);
            AuditLogger.logAction('findNextStageById', {stages, stageId});
            const stage = stages.find((stage: any) => stage.id === stageId);
            if (!stage) {
                throw createHttpError(StatusCodes.NOT_FOUND, 'Stage not found');
            }
            return stage;
        } catch (error) {
            logger.error('WorkflowService --> endWorkflowInstance  --> error', error);
            throw error;
        }
    }

    async updateHistory(history: any[], nextStage: any, user: any, comments: string) {
        try {
            //  let newHistoryEntry: any = {
            //     stageId: nextStage.id,
            //     stageName: nextStage.name,
            //     performedBy: 'admin',
            //     timeStamp: moment().format('YYYY-MM-DD HH:mm:ss'),
            // };
            // console.log('new History Entru is',newHistoryEntry)
            // const existingEntryIndex = history.findIndex((entry: any) => entry.stageId === nextStage.id);
            // console.log('exisitngEntryInde ix',existingEntryIndex)
            // if (existingEntryIndex !== -1) {
            //     history[existingEntryIndex] = { ...history[existingEntryIndex], ...newHistoryEntry };
            // } else {
            //     history.push(newHistoryEntry);
            // }
            const length = history.length;
            const lastEntryStage = history[length-1];

            if(lastEntryStage.stageId !== nextStage.id) {
                const currentStageEntry = {
                    stageId: lastEntryStage.stageId,
                    stageName: lastEntryStage.stageName,
                    performedBy: 'admin',
                    timeStamp: moment().format('YYYY-MM-DD HH:mm:ss'),
                    comments: comments,
                }
                const transitionEntry = {
                    stageId: nextStage.id,
                    stageName: nextStage.name,
                    performedBy: 'admin',
                    timeStamp: moment().format('YYYY-MM-DD HH:mm:ss'),
                };
                history.push(currentStageEntry);
                history.push(transitionEntry);
            } else {
                const currenStageEntry = {
                    stageId: nextStage.id,
                    stageName: nextStage.name,
                    performedBy: 'admin',
                    timeStamp: moment().format('YYYY-MM-DD HH:mm:ss'),
                    comments: comments,
                };
                history.push(currenStageEntry)
            }
            return history;
        } catch (error) {
            logger.error('WorkflowService --> updateHistory  --> error', error);
            throw error;
        }
    }

    async updateInstanceData(instanceData: any, stage: any, user_id: any, user: any, currentAllowedRoles: any, currentAllowedUsers: any, comments: string) {
        try {
            logger.info('WorkflowService --> updateInstanceData  --> instanceData', instanceData);
            
            //instanceData[0].requestedData = (requestedData && Object.keys(requestedData)?.length > 0) ? requestedData : instanceData?.requestedData || {};
            instanceData[0].current_stage = stage.name;
            instanceData[0].status = stage.status;
            instanceData[0].possible_actions = stage?.isEnd ? null : stage?.nextPossibleActions;
            instanceData[0].current_allowed_roles = currentAllowedRoles;
            instanceData[0].current_allowed_users = currentAllowedUsers;
            instanceData[0].history = await this.updateHistory(instanceData[0].history, stage, user, comments);
            return instanceData;
        } catch (error) {
            logger.error('WorkflowService --> updateInstanceData  --> error', error);
            throw error;
        }
    }

    async validateStageTransition(possible_actions: any, stageId: string) {
        const isAllowed = possible_actions.find((nextPossibleAction: any) => nextPossibleAction.id === stageId);
        console.log('isAllowed is',isAllowed);
        return isAllowed;
    }   

    async updateWorkflowInstanceById(instanceId: any, data: any) {
         try {
            logger.info('WorkflowService --> updateWorkflowInstanceById  --> data', data);
            AuditLogger.logAction('updateWorkflowInstanceById', {data});
            const { error } = updateWorkflowInstanceSchema.validate(data);
            if (error) {
                throw createHttpError(StatusCodes.BAD_REQUEST, error.details[0].message);
            }
            const { workflowId, assetId, type, stageId, user_id, user, comments} = data;  
            console.log('data is',data);   
            const workflowInstanceData = await this.getWorkflowInstance(instanceId);     
            console.log('workflowInstance Data is',workflowInstanceData);    
            const canMoveToProvidedStage = await this.validateStageTransition(workflowInstanceData[0]?.possible_actions, stageId);
            if(!canMoveToProvidedStage) {
                throw createHttpError(StatusCodes.BAD_REQUEST, "Invalid stage transition: not allowed from current stage.");
            }
            const workflowDefinition = await this.getWorkflowDefinition(workflowId);
            console.log('workflowDefinitoin is',workflowDefinition);       
            const assetData = await this.getAsset(assetId, type);
            console.log('assetData is',assetData);
            const stage = await this.findNextStageById(workflowDefinition[0]?.stages, stageId);         
            console.log('stage is',stage);
            const { currentAllowedRoles, currentAllowedUsers } = await this.getAllowedRolesAndUsers(stage?.nextPossibleActions, workflowDefinition[0]?.stages);
            let updatedInstanceData = await this.updateInstanceData(workflowInstanceData, stage, user_id, user, currentAllowedRoles, currentAllowedUsers, comments);      
            console.log('updated Instance Data is',updatedInstanceData)
            
            console.log(updatedInstanceData[0].history);
            const newWorkflowRequest = {
                instanceId: instanceId,
                workflowId,
                workflowName: workflowDefinition[0].name,
                currentStage: stage.name,
                status: stage.status,
                possibleActions: stage?.isEnd ? null : stage.nextPossibleActions,
                current_allowed_roles: currentAllowedRoles,
                current_allowed_users: currentAllowedUsers,
                // ...(requestedData && Object.keys(requestedData).length > 0 && { requestedData }),
                performedBy: 'admin 2',
                user_id: 'user1',
                lastModifiedAt: moment().format('YYYY-MM-DD HH:mm:ss')
            };
            console.log('newWorkflowRequest newWorkflowRequest',newWorkflowRequest);
            await this.workflowRepository.updateWorkflowInstanceById(instanceId, updatedInstanceData);
            // await this.updateAssetWithSuggestedMetadata(type, assetId, assetData, newWorkflowRequest);
            // if (stage.actionType === 'handler') {
            //     const handlerFunction = this.handlerFunctions[stage.handlerFunction];
            //     if (!handlerFunction) {
            //         throw createHttpError(StatusCodes.INTERNAL_SERVER_ERROR, 'Handler function not found');
            //     } else {
            //         let changeData:any = data;
            //         changeData = {
            //             instanceId,
            //             assetId,
            //             type
            //         }
            //         await handlerFunction(changeData);
            //     }
            //     if (!stage.isEnd) {
            //         const nextStage = await this.findStageById(workflowDefinition?.stages, stage?.nextPossibleActions[0]?.id);
            //         const { currentAllowedRoles, currentAllowedUsers } = await this.getAllowedRolesAndUsers(nextStage?.nextPossibleActions, workflowDefinition?.stages);
            //         const nextInstanceData = {
            //             instanceId,
            //             assetId,
            //             workflowId,
            //             stageId: nextStage?.id,
            //             currentAllowedRoles: currentAllowedRoles,
            //             currentAllowedUsers: currentAllowedUsers,
            //             possibleActions: nextStage?.isEnd ? null : nextStage?.nextPossibleActions,
            //             user_id: 'system',
            //             performedBy: 'system',
            //             user: 'system',
            //             type
            //         };
            //         await this.updateWorkflowInstanceById(instanceId, nextInstanceData)
            //     }
            // }
            const finalWorkflowInstanceData = await this.getWorkflowInstance(instanceId);
            return {
                message: 'Workflow instance updated successfully',
                data: finalWorkflowInstanceData,
            };
        } catch (error) {
            logger.error('WorkflowService --> updateWorkflowInstanceById  --> error', error);
            throw error;
        }
    }

    async updateMetadata(data: any): Promise<any> {
        try {
            const { type, assetId, instanceId } = data;
            const assetDoc = await this.workflowRepository.getAssetDataByTypeAndId(assetId, type);
            if (!assetDoc) {
                throw createHttpError(StatusCodes.NOT_FOUND, 'Asset not found');
            }
            const assetData = assetDoc;
            const workflowRequests = assetData?.workflowRequests || [];
            const instanceData = workflowRequests.find(
                (request: any) => request.instanceId === instanceId
            );
            if (!instanceData) {
                throw createHttpError(StatusCodes.NOT_FOUND, 'Workflow instance not found');
            }
            const requestedData = instanceData?.requestedData || {};
            for (const field in requestedData) {
                const fieldUpdate = requestedData[field];
                if (typeof assetData[field] === 'string') {
                    if (fieldUpdate.add) {
                        assetData[field] = fieldUpdate.add;
                    }
                } else if (Array.isArray(assetData[field])) {
                    if (fieldUpdate.add) {
                        assetData[field] = [...assetData[field], ...fieldUpdate.add];
                    }
                    if (fieldUpdate.remove) {
                        assetData[field] = assetData[field].filter((item: any) => !fieldUpdate.remove.includes(item));
                    }
                }
            }
            await this.workflowRepository.updateAssetData(type, assetId, assetData);
            return { message: 'Metadata updated successfully' };

        } catch (error) {
            logger.error('WorkflowService --> updateMetadata  --> error', error);
            throw error;
        }
    }
}
