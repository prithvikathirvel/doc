import { WorkflowRepository as MYSQLWorkflowRepository } from "../dao/mysql/workflowDao";
import { AuditLogger } from "../utils/audit";
import logger from "../utils/logger";
import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';
import { createWorkflowInstanceSchema, stageSchema, updateStageSchema, updateWorkflowInstanceSchema, workflowSchema } from "../validator/createWorkflowSchema";
import moment from "moment";
import { error } from "console";
import { create } from "domain";

export class WorkflowService {
    private workflowRepository: MYSQLWorkflowRepository;

    constructor() {
        this.workflowRepository = new MYSQLWorkflowRepository();
    }

    handlerFunctions: any = {
        'createSummary': this.updateMetadata,
        'endWorkflowHandler': this.endWorkflowInstance,
        'ReduceLeaveBalance': this.reduceLeaveBalanceHandler.bind(this),
    }

    
    //Workflow Services
    async createWorkflow(workflowData: any, userDetails: any) {
        try {
            logger.info('WorkflowService --> createWorkflow  --> data', workflowData);
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
            await this.validateStages(workflowData);
            await this.workflowRepository.createWorkflow(workflowData, userDetails);
            return { code: 0, data: `Workflow with the name '${workflowName}' created Successfully`};
        } catch (error) {
            logger.error('WorkflowService --> createWorkflow  --> error', error);
            throw error;
        }
    }

    async validateStages(workflowData: any) {
        try {
            logger.info('WorkflowService --> isStartStageorEndStageDuplicated --> data', workflowData);
            AuditLogger.logAction('isStartStageorEndStageDuplicated', {workflowData});
            const isStartStageDuplicated = workflowData.stages.filter((stage: any)=> stage.isStart === true);
            if(isStartStageDuplicated.length > 1) {
                throw createHttpError(StatusCodes.UNPROCESSABLE_ENTITY, 'Only one stage can be Start Stage');
            } else if(isStartStageDuplicated.length === 0) {
                throw createHttpError(StatusCodes.UNPROCESSABLE_ENTITY, 'No Start stage provided');
            }
            const isEndStageDuplicated = workflowData.stages.filter((stage: any)=> stage.isEnd === true);   
            if(isEndStageDuplicated.length > 1) {
                throw createHttpError(StatusCodes.UNPROCESSABLE_ENTITY, 'Only one stage can be End Stage');
            } else if(isEndStageDuplicated.length === 0) {
                throw createHttpError(StatusCodes.UNPROCESSABLE_ENTITY, 'No end stage provided');
            }
            const ids = workflowData.stages.map((stage: any) => stage.id);
            const uniqueIds = new Set(ids);
            if (ids.length !== uniqueIds.size) {
                throw createHttpError(StatusCodes.UNPROCESSABLE_ENTITY, 'Duplicate stage IDs found. Each stage must have a unique id.');
            }
            const errors: any = [];
            workflowData.stages.forEach((stage: any, index: any) => {
                const isNextPossibleActionPresent = stage?.nextPossibleActions;
                let nextPossibleActionLength;
                let isDecisionCorrect;
                if ((isNextPossibleActionPresent && stage?.isDecision === undefined) || (!isNextPossibleActionPresent && stage?.isDecision!==undefined)) {
                    throw createHttpError(StatusCodes.UNPROCESSABLE_ENTITY, `'isDecision' must be present only when 'nextPossibleActions' is present, and vice versa.`);
                }   
                if(isNextPossibleActionPresent) {
                    nextPossibleActionLength = stage?.nextPossibleActions?.length;
                    isDecisionCorrect = (nextPossibleActionLength > 1 && stage?.isDecision === true) || (nextPossibleActionLength === 1 && stage?.isDecision === false)
                    const isDecision = stage.isDecision;
                    if (!isDecisionCorrect) {
                        errors.push(`Stage at index ${index} with name '${stage.name}': ` + 
                        (isDecision === undefined ? 'isDecision is not present' 
                            : `isDecision must be ${nextPossibleActionLength > 1 ? 'true' : 'false'} when nextPossibleActions length is ${nextPossibleActionLength}`
                        )
                    );
                }}
            })
            if(errors.length > 0) {
                throw createHttpError(StatusCodes.UNPROCESSABLE_ENTITY, errors.join('  '));
            }
        } catch(error) {
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
            return [workflow].map((workflow: any) => {
                return {...workflow, isActive: workflow.isActive === 1}
            });
        } catch (error) {
            logger.error('WorkflowService --> getWorkflowById  --> error', error);
            throw error;
        }
    }

    async updateWorkflowById(workflowId: string, updatedData: any, userDetails: any) {
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
            await this.validateStages(updatedData);
            await this.workflowRepository.updateWorkflowById(workflowId, updatedData, userDetails);
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
    async createStage(stageData: any, userDetails: any) {
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
            await this.workflowRepository.createStage(stageData, userDetails);
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
                throw createHttpError(StatusCodes.NOT_FOUND, `Stage does not exists`);
            }
            return isStagePresentForId;
        }
        catch (error: any) {
            logger.error('WorkflowService --> getStageById  --> error', error);
            throw error;
        }
    }

    async updateStageById(stageId: string, updatedData: any, userDetails: any) {
        try {
            logger.info('WorkflowService --> updateStageById  --> data', updatedData);
            AuditLogger.logAction('updateWorkflowById', {updatedData});
            const { error } = updateStageSchema.validate(updatedData);
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
            await this.workflowRepository.updateStageById(stageId, updatedData, userDetails);
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
            console.log('whart is stage ',stage);
            const newStatus = !(stage[0].isActive === true);
            console.log('newStatus',newStatus)
            await this.workflowRepository.activateStage(stageId, newStatus);

            return newStatus ? { code: 0, message: 'Stage enabled successfully' } : { code: 0, message: 'Stage disabled successfully' };
        } catch (error) {
            logger.error('WorkflowService --> activateStage  --> error', error);
            throw error;
        }
    }

    async getAsset(assetId: any, type: string) {
        try {
            logger.info('WorkflowService --> getAsset --> assetId', assetId);
            const documentData = await this.workflowRepository.getAssetDataByTypeAndId(assetId, type);
            console.log('document Data is',documentData);
            if (!documentData) {
                throw createHttpError(StatusCodes.NOT_FOUND, 'Document not found');
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
            if (!startStage.isStart) {
                throw new Error('No start stage is defined in the workflow');
            }
            return startStage;
        } catch (error) {
            logger.error('WorkflowService --> findStartStage  --> error', error);
            throw error;
        }
    }

    async createInstanceData(assetId: any, type: string, workflowId: any, workflowName: any, startStage: any, userId: any, userName: any, currentAllowedRoles: any, currentAllowedUsers: any) {
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
                requestedBy: userName,
                userId,
                history: [{
                    stageId: startStage.id,
                    stageName: startStage.name,
                    performedBy: userName,
                    timestamp: moment().format('YYYY-MM-DD HH:mm:ss'),
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

    async getAllowedRolesAndUsers(nextStages: any, stages: any) {
        console.log('called ehre');
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
            console.log('current Allowed ROles',currentAllowedRoles);
            console.log('curent allwoed user ',currentAllowedUsers);
            return { currentAllowedRoles, currentAllowedUsers };
        } catch (error) {
            logger.error('WorkflowService --> getAllowedRolesAndUsers  --> error', error);
            throw error;
        }
    }
    
    //WorkflowInstanceServices
    async createWorkflowInstance(workflowInstanceData: any, userDetails: any) {
        try {
            logger.info('WorkflowService --> createWorkflowInstance  --> data', workflowInstanceData);
            AuditLogger.logAction('createWorkflowInstance', {workflowInstanceData});
            const { error } = createWorkflowInstanceSchema.validate(workflowInstanceData);
            if (error) {
                throw createHttpError(StatusCodes.BAD_REQUEST, error.details[0].message);
            }
            const { assetId, workflowId, type} = workflowInstanceData;
            const { userId, userName } = userDetails;
            const workflowDefinition = await this.getWorkflowDefinition(workflowId);
            if(!workflowDefinition) {
                throw createHttpError(StatusCodes.BAD_REQUEST, `No Workflow present for the id ${workflowId}`);
            }
            const assetData = await this.getAsset(assetId, type);
            const startStage = await this.findStartStage(workflowDefinition.stages);
            
            // const isActiveWorkflowExists = assetData[0]?.isActiveWorkflowExists === 1 ? true : false;
            // if (isActiveWorkflowExists) {
            //     return {
            //         message: 'Active workflow instance already exists for this asset',
            //     };
            // }

            // const { currentAllowedRoles, currentAllowedUsers } = await this.getAllowedRolesAndUsers(startStage?.nextPossibleActions, workflowDefinition?.stages);
            const currentAllowedUsers = startStage?.allowedUsers;
            const currentAllowedRoles = startStage?.allowedRoles;
            const instanceData = await this.createInstanceData(assetId, type, workflowId, workflowDefinition.name, startStage, userId, userName, currentAllowedRoles, currentAllowedUsers);
            const newInstance = await this.workflowRepository.addWorkflowInstance(instanceData, userDetails);
            const newWorkflowRequest = {
                    instanceId: newInstance.id,
                    workflowId,
                    workflowName: workflowDefinition.name,
                    currentStage: startStage.name,
                    status: startStage.status,
                    possibleActions: startStage.nextPossibleActions,
                    currentAllowedRoles: startStage?.allowedRoles, 
                    currentAllowedUsers: startStage?.allowedUsers,
                    requestedBy: userName,
                    user_id: userId,
                    requestedAt: moment().format('YYYY-MM-DD HH:mm:ss'),
            }
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
        console.log('called twice here',instanceId);
     
        try {
            logger.info('WorkflowService --> getWorkflowInstance  --> instanceId', instanceId);
            AuditLogger.logAction('getWorkflowInstance', {instanceId});
            const workflowInstanceData = await this.workflowRepository.getWorkflowInstanceById(instanceId);
            console.log('data is what',workflowInstanceData);
            if (!workflowInstanceData) {
                throw createHttpError(StatusCodes.NOT_FOUND, 'Workflow instance not found');
            }
            return workflowInstanceData;
        } catch (error) {
            logger.error('WorkflowService --> getWorkflowInstance  --> error', error);
            throw error;
        }
    }
    
    async getAllWorkflowInstances(data: any, userId: any) {
         try {
            logger.info('WorkflowService --> getAllWorkflowInstances  --> data', data);
            AuditLogger.logAction('getAllWorkflowInstances', {data});
            const user = await this.workflowRepository.getUserDetails(userId);
            if (!user) {
                throw createHttpError(StatusCodes.NOT_FOUND, 'User not found');
            }
            console.log('user is what',user)
            const workflowInstances = await this.workflowRepository.getAllWorkflowInstanceByUser(user?.role, user?.emailId);
            return workflowInstances;
        } catch (error) {
            logger.error('WorkflowService --> getAllWorkflowInstances  --> error', error);
            throw error;
        }
    }

    async findStageById(stages: any, stageId: any) {
         try {
            logger.info('WorkflowService --> findStageById  --> data', stageId);
            AuditLogger.logAction('findStageById', {stages, stageId});
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

    // async updateHistory(history: any[], nextStage: any, userName: any, comments: string) {
    //     try {
    //         const length = history.length;
    //         const lastEntryStage = history[length-1];
    //         let statusFlag = 0;
    //         if(lastEntryStage.stageId !== nextStage.id) {
    //             statusFlag = 0;
    //             const currentStageEntry = {
    //                 stageId: lastEntryStage.stageId,
    //                 stageName: lastEntryStage.stageName,
    //                 performedBy: userName,
    //                 timeStamp: moment().format('YYYY-MM-DD HH:mm:ss'),
    //                 comments: comments,
    //                 status: 'Approved'
    //             }
    //             const transitionEntry = {
    //                 stageId: nextStage.id,
    //                 stageName: nextStage.name,
    //                 timeStamp: moment().format('YYYY-MM-DD HH:mm:ss'),
    //                 status: 'In Progress'
    //             };
    //             history.push(currentStageEntry);
    //             history.push(transitionEntry);
    //         } else {
    //             statusFlag = 1;
    //             const currentStageEntry = {
    //                 stageId: nextStage.id,
    //                 stageName: nextStage.name,
    //                 performedBy: userName,
    //                 timeStamp: moment().format('YYYY-MM-DD HH:mm:ss'),
    //                 comments: comments,
    //                 status: 'Rejected'
    //             };
    //             history.push(currentStageEntry)
    //         }
    //         return { history: history, status: statusFlag === 0 ? 'In Progress' : 'Regected'};
    //     } catch (error) {
    //         logger.error('WorkflowService --> updateHistory  --> error', error);
    //         throw error;
    //     }
    // }

    async updateHistory(history: any[], stage: any, user: any) {
         try {
            console.log('Updating workflow history');
            let newHistoryEntry: any = {
                stageId: stage.id,
                stageName: stage.name,
                performedBy: user,
                timeStamp: new Date().toISOString(),
            };
            const existingEntryIndex = history.findIndex((entry: any) => entry.stageId === stage.id);
            if (existingEntryIndex !== -1) {
                history[existingEntryIndex] = { ...history[existingEntryIndex], ...newHistoryEntry };
            } else {
                history.push(newHistoryEntry);
            }
            return history;
        } catch (error) {
            console.error('workflowService --> updateHistory --> error ::', error);
            throw error;
        }
    }

    async updateInstanceData(instanceData: any, stage: any, user_id: any, userName: any, currentAllowedRoles: any, currentAllowedUsers: any, requestedData: any) {
        try {
            console.log('xxmlcxlmc')
            logger.info('WorkflowService --> updateInstanceData  --> instanceData', instanceData);
            console.log('instanceData instanceData instanceData',instanceData)
            instanceData[0].requestedData = (requestedData && Object.keys(requestedData)?.length > 0) ? requestedData : instanceData?.requestedData || {};
            instanceData[0].current_stage = stage.name;
            instanceData[0].status = stage.status;
            instanceData[0].possible_actions = stage?.isEnd ? null : stage?.nextPossibleActions;
            instanceData[0].current_allowed_roles = currentAllowedRoles;
            instanceData[0].current_allowed_users = currentAllowedUsers;
            instanceData[0].history = await this.updateHistory(instanceData[0].history, stage, userName);
            return instanceData;
        } catch (error) {
            logger.error('WorkflowService --> updateInstanceData  --> error', error);
            throw error;
        }
    }

    async validateStageTransition(possible_actions: any, stageId: string) {
        const isAllowed = possible_actions.find((nextPossibleAction: any) => nextPossibleAction.id === stageId);
        if(!isAllowed) {
            throw createHttpError(StatusCodes.BAD_REQUEST, "Invalid stage transition: not allowed from current stage.");
        } 
    }   

    async getWorkflowInstanceByDocId(docId: any) {
        const instance = await this.workflowRepository.getWorkflowInstanceByDocId(docId);
        return instance;

    }

    async updateWorkflowInstanceById(instanceId: any, data: any, userDetails: any) {
         try {
                logger.info('WorkflowService --> updateWorkflowInstanceById  --> data', data);
                AuditLogger.logAction('updateWorkflowInstanceById', {data});
                const { error } = updateWorkflowInstanceSchema.validate(data);
                if (error) {
                    throw createHttpError(StatusCodes.BAD_REQUEST, error.details[0].message);
                }
                const { workflowId, assetId, stageId, requestedData, type} = data;
                const { userId, userName } = userDetails;  
                const workflowInstanceData = await this.getWorkflowInstance(instanceId);        
                const workflowDefinition = await this.getWorkflowDefinition(workflowId);   
                const assetData = await this.getAsset(assetId, type);
                const stage = await this.findStageById(workflowDefinition?.stages, stageId); 
                //await this.validateStageTransition(workflowInstanceData[0]?.possible_actions, stageId);
                const { currentAllowedRoles, currentAllowedUsers } = await this.getAllowedRolesAndUsers(stage?.nextPossibleActions, workflowDefinition?.stages);
                
                let updatedInstanceData = await this.updateInstanceData(workflowInstanceData, stage, userId, userName, currentAllowedRoles, currentAllowedUsers, requestedData);      
                const newWorkflowRequest = {
                    instanceId: instanceId,
                    workflowId,
                    workflowName: workflowDefinition.name,
                    currentStage: stage.name,
                    status: stage.status,
                    possibleActions: stage?.isEnd ? null : stage.nextPossibleActions,
                    current_allowed_roles: currentAllowedRoles,
                    current_allowed_users: currentAllowedUsers,
                    ...(requestedData && Object.keys(requestedData).length > 0 && { requestedData }),
                    performedBy: userName,
                    user_id: userId,
                    lastModifiedAt: moment().format('YYYY-MM-DD HH:mm:ss')
                };
                console.log('newWorkflowRequest newWorkflowRequest is',newWorkflowRequest);

                //await this.workflowRepository.updateWorkflowInstanceById(instanceId, updatedInstanceData);
                //await this.updateAssetWithSuggestedMetadata(type, assetId, assetData, newWorkflowRequest);
                // console.log('stage is what',stage);
                if (stage.actionType === 'handler') {
                    console.log('function to be called here working or not');
                const handlerFunction = this.handlerFunctions[stage.handlerFunction];
                if (!handlerFunction) {
                    console.log('called inside if part');
                    throw createHttpError(StatusCodes.INTERNAL_SERVER_ERROR, 'Handler function not found');
                } else {
                    let changeData:any = data;
                    changeData = {
                        instanceId,
                        assetId,
                        type
                    }
                    console.log('called inside else part');
                    await handlerFunction(changeData);
                }
                if (!stage.isEnd) {
                    const nextStage = await this.findStageById(workflowDefinition?.stages, stage?.nextPossibleActions[0]?.id);
                    const { currentAllowedRoles, currentAllowedUsers } = await this.getAllowedRolesAndUsers(nextStage?.nextPossibleActions, workflowDefinition?.stages);
                    const nextInstanceData = {
                        instanceId,
                        assetId,
                        workflowId,
                        stageId: nextStage?.id,
                        currentAllowedRoles: currentAllowedRoles,
                        currentAllowedUsers: currentAllowedUsers,
                        possibleActions: nextStage?.isEnd ? null : nextStage?.nextPossibleActions,
                        user_id: 'system',
                        performedBy: 'system',
                        user: 'system',
                        type
                    };
                    await this.updateWorkflowInstanceById(instanceId, nextInstanceData, userDetails)
                }}
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

    async endWorkflowInstance(data: any) {
        console.log('data is',data);
         try {
            logger.info('WorkflowService --> endWorkflowInstance  --> data', data);
            AuditLogger.logAction('endWorkflowInstance', {data});
            const { instanceId, assetId, type } = data;
            console.log('fusss')
            const assetData = await this.workflowRepository.getAssetDataByTypeAndId(assetId, type);
            console.log('assetData assetData',assetData)
            if (!assetData) {
                throw createHttpError(StatusCodes.NOT_FOUND, 'Asset not found');
            }
            assetData.workflowRequests = assetData.workflowRequests.filter(
                (request: any) => request.instanceId !== instanceId
            );
            await this.workflowRepository.updateSuggestedAssetData(type, assetId, assetData.workflowRequests);
            console.log(`Workflow Instance ended successfully`);
        } catch (error) {
            logger.error('WorkflowService --> endWorkflowInstance  --> error', error);
            throw error;
        }
    }

    async reduceLeaveBalanceHandler({ instanceId, assetId, type }: { instanceId: string, assetId: string, type: string }) {
        console.log('called here inside reduceLeaveBalanceHandler');
        console.log('instanceId under handler funton',instanceId);
        const leaveRequestInstanceData = await this.getWorkflowInstance(instanceId);
        console.log('leaveRequestInstanceData',leaveRequestInstanceData)
        if (!leaveRequestInstanceData) throw new Error('Leave request not found');

        const userId = leaveRequestInstanceData[0].user_id;
        const userDetails = await this.workflowRepository.getUserDetails(userId);
        if (!userDetails) throw new Error('User not found');
        const leaveBalance = userDetails?.leaveBalance;
        if(leaveBalance < 0) {
            throw new Error('Not Enough Leave balance');
        }
        await this.workflowRepository.updateUserLeaveBalance(userId, leaveBalance-1);
        return {code: 0, message: 'Leave Updated Successfully'};
    }
}
