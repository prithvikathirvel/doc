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
    async createWorkflow(workflowData: any, userDetails: any) {
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
            await this.workflowRepository.createWorkflow(workflowData, userDetails);
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

    async getAsset(assetId: any) {
        try {
            logger.info('WorkflowService --> getAsset --> assetId', assetId);
            const documentData = await this.workflowRepository.getAssetDataByTypeAndId(assetId);
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

    async findStartStage(stages: any, stageId: any) {
        try {
            logger.info('WorkflowService --> findStartStage --> stages',stages);
            const stage = stages.find((stage: any) => stage.id === stageId);
            if(!stage) {
                throw new Error('Provided StageId does not exists in Workflow. ')
            }
            if (!stage.isStart) {
                throw new Error('Provided StageId is not the start stage of the workflow.');
            }
            return stage;
        } catch (error) {
            logger.error('WorkflowService --> findStartStage  --> error', error);
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

    async createInstanceData(assetId: any, workflowId: any, workflowName: any, startStage: any, userId: any, userName: any, currentAllowedRoles: any, currentAllowedUsers: any) {
        try {
            logger.info('WorkflowService --> createInstanceData --> stages', assetId);
            return {
                workflowId,
                workflowName,
                currentStage: startStage.name,
                status: 'Workflow Initiated',
                possibleActions: startStage.nextPossibleActions,
                currentAllowedRoles,
                currentAllowedUsers,
                assetId,
                assetType: 'Document',
                requestedBy: userName,
                userId,
                history: [{
                    // stageId: startStage.id,
                    // stageName: startStage.name,
                    WorkflowCreatedBy: userName,
                    timestamp: moment().format('YYYY-MM-DD HH:mm:ss'),
                    status: 'Workflow Initiated'
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
    async createWorkflowInstance(workflowInstanceData: any, userDetails: any) {
        try {
            logger.info('WorkflowService --> createWorkflowInstance  --> data', workflowInstanceData);
            AuditLogger.logAction('createWorkflowInstance', {workflowInstanceData});
            const { error } = createWorkflowInstanceSchema.validate(workflowInstanceData);
            if (error) {
                throw createHttpError(StatusCodes.BAD_REQUEST, error.details[0].message);
            }
            const { assetId, workflowId, stageId} = workflowInstanceData;
            const { userId, userName } = userDetails;
            const workflowDefinition = await this.getWorkflowDefinition(workflowId);
            if(!workflowDefinition) {
                throw createHttpError(StatusCodes.BAD_REQUEST, `No Workflow present for the id ${workflowId}`);
            }
            const assetData = await this.getAsset(assetId);
            const activeWorkflows = assetData[0]?.workflowRequests?.filter((req: any) => req.status !== 'completed');
            if (activeWorkflows && activeWorkflows?.length > 0) {
                return {
                    message: 'Active workflow instance already exists for this asset',
                    data: activeWorkflows
                };
            }
            const startStage = await this.findStartStage(workflowDefinition[0].stages, stageId);
            console.log('startStage',startStage);
            const instanceData = await this.createInstanceData(assetId, workflowId, workflowDefinition[0].name, startStage, userId, userName, startStage?.allowedRoles, startStage?.allowedUsers);
            const newInstance = await this.workflowRepository.addWorkflowInstance(instanceData);
            // const existingRequests = Array.isArray(assetData[0].workflowRequests) ? assetData[0].workflowRequests : [];
            // console.log('exisitng Request si',existingRequests)
            // const newWorkflowRequest = [
            //     ...existingRequests,
            //     {
            //         instanceId: newInstance.id,
            //         workflowId,
            //         workflowName: workflowDefinition[0].name,
            //         currentStage: startStage.name,
            //         status: startStage.status,
            //         possibleActions: startStage.nextPossibleActions,
            //         currentAllowedRoles: startStage?.allowedRoles, 
            //         currentAllowedUsers: startStage?.allowedUsers,
            //         requestedBy: userName,
            //         user_id: userId,
            //         requestedAt: moment().format('YYYY-MM-DD HH:mm:ss'),
            //     }
            // ];
            // console.log('newWorkflowReqeust is',newWorkflowRequest)
            // await this.updateAssetWithSuggestedMetadata(type, assetId, assetData, newWorkflowRequest);
            // return {
            //     message: 'Workflow instance created successfully',
            // };
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
            const user = await this.workflowRepository.getUserDetails(user_id);
            if (!user) {
                throw createHttpError(StatusCodes.NOT_FOUND, 'User not found');
            }
            console.log('user is what',user)
            const workflowInstances = await this.workflowRepository.getAllWorkflowInstanceByUser(user?.role, user?.emailId);
            return workflowInstances;
        } catch (error) {
            logger.error('WorkflowService --> getWorkflowInstance  --> error', error);
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
            const assetData = await this.workflowRepository.getAssetDataByTypeAndId(assetId);
            console.log('assetData assetData',assetData)
            if (!assetData) {
                throw createHttpError(StatusCodes.NOT_FOUND, 'Asset not found');
            }
            // assetData[0].workflowRequests = assetData.workflowRequests.filter(
            //     (request: any) => request.instanceId !== instanceId
            // );
            //await this.workflowRepository.updateSuggestedAssetData(type, assetId, assetData.workflowRequests);
        } catch (error) {
            logger.error('WorkflowService --> endWorkflowInstance  --> error', error);
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

    async updateHistory(history: any[], nextStage: any, userName: any, comments: string) {
        try {
            const length = history.length;
            const lastEntryStage = history[length-1];

            if(lastEntryStage.stageId !== nextStage.id) {
                const currentStageEntry = {
                    stageId: lastEntryStage.stageId,
                    stageName: lastEntryStage.stageName,
                    performedBy: userName,
                    timeStamp: moment().format('YYYY-MM-DD HH:mm:ss'),
                    comments: comments,
                    status: 'Approved'
                }
                const transitionEntry = {
                    stageId: nextStage.id,
                    stageName: nextStage.name,
                    timeStamp: moment().format('YYYY-MM-DD HH:mm:ss'),
                    status: 'In Progress'
                };
                history.push(currentStageEntry);
                history.push(transitionEntry);
            } else {
                const currenStageEntry = {
                    stageId: nextStage.id,
                    stageName: nextStage.name,
                    performedBy: userName,
                    timeStamp: moment().format('YYYY-MM-DD HH:mm:ss'),
                    comments: comments,
                    status: 'Rejected'
                };
                history.push(currenStageEntry)
            }
            return history;
        } catch (error) {
            logger.error('WorkflowService --> updateHistory  --> error', error);
            throw error;
        }
    }

    async updateInstanceData(instanceData: any, stage: any, user_id: any, userName: any, currentAllowedRoles: any, currentAllowedUsers: any, comments: string) {
        try {
            logger.info('WorkflowService --> updateInstanceData  --> instanceData', instanceData);
            instanceData[0].current_stage = stage.name;
            instanceData[0].status = stage.status;
            instanceData[0].possible_actions = stage?.isEnd ? null : stage?.nextPossibleActions;
            instanceData[0].current_allowed_roles = currentAllowedRoles;
            instanceData[0].current_allowed_users = currentAllowedUsers;
            instanceData[0].history = await this.updateHistory(instanceData[0].history, stage, userName, comments);
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

    async updateWorkflowInstanceById(instanceId: any, data: any, userDetails: any) {
         try {
            logger.info('WorkflowService --> updateWorkflowInstanceById  --> data', data);
            AuditLogger.logAction('updateWorkflowInstanceById', {data});
            const { error } = updateWorkflowInstanceSchema.validate(data);
            if (error) {
                throw createHttpError(StatusCodes.BAD_REQUEST, error.details[0].message);
            }
            const { workflowId, assetId, stageId, comments} = data;  
            const workflowInstanceData = await this.getWorkflowInstance(instanceId);        
            const workflowDefinition = await this.getWorkflowDefinition(workflowId);   
            const assetData = await this.getAsset(assetId);
            const stage = await this.findStageById(workflowDefinition[0]?.stages, stageId); 
            await this.validateStageTransition(workflowInstanceData[0]?.possible_actions, stageId);
            const currentAllowedRoles = stage.allowedRoles;
            const currentAllowedUsers = stage.allowedUsers;
            const { userId, userName } = userDetails;
            let updatedInstanceData = await this.updateInstanceData(workflowInstanceData, stage, userId, userName, currentAllowedRoles, currentAllowedUsers, comments);      
            const newWorkflowRequest = {
                instanceId: instanceId,
                workflowId,
                workflowName: workflowDefinition[0].name,
                currentStage: stage.name,
                status: stage.status,
                possibleActions: stage?.isEnd ? null : stage.nextPossibleActions,
                current_allowed_roles: currentAllowedRoles,
                current_allowed_users: currentAllowedUsers,
                performedBy: userName,
                user_id: userId,
                lastModifiedAt: moment().format('YYYY-MM-DD HH:mm:ss')
            };
            console.log('newWorkflowRequest newWorkflowRequest',newWorkflowRequest);

            await this.workflowRepository.updateWorkflowInstanceById(instanceId, updatedInstanceData);
            // await this.updateAssetWithSuggestedMetadata(type, assetId, assetData, newWorkflowRequest);
            // console.log('stage is what',stage);
            // if (stage.actionType === 'handler') {
            //     const handlerFunction = await this.handlerFunctions[stage.handlerFunction];
            //     console.log('handlerFunction is',handlerFunction);
            //     if (!handlerFunction) {
            //         throw createHttpError(StatusCodes.INTERNAL_SERVER_ERROR, 'Handler function not found');
            //     } else {
            //         let changeData:any = data;
            //         changeData = {
            //             instanceId,
            //             assetId,
            //             type
            //         }
            //         await handlerFunction.call(this, changeData);
            //     }
            //     console.log('finished')
            //     if (!stage.isEnd) {
            //         console.log('stage is not end');
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
            //         console.log('nextInstance Data is',nextInstanceData);
            //         //await this.updateWorkflowInstanceById(instanceId, nextInstanceData)
            //     } else {
            //         console.log('worfklow is done');
            //         const completeInstanceData = {
            //             instanceId,
            //             assetId,
            //             workflowId,
            //             stageId: stage?.id,
            //             current_allowed_roles: [],
            //             current_allowed_users: [],
            //             possibleActions: [],
            //             user_id: 'system',
            //             performedBy: 'system',
            //             user: 'system',
            //             type
            //         };
            //         await this.workflowRepository.updateWorkflowInstanceById(instanceId, [completeInstanceData]);
            //     }
            //     console.log("THANKS UPDATED")
            // }
            // const finalWorkflowInstanceData = await this.getWorkflowInstance(instanceId);
            // console.log('finalWorkflowInstanceData is',finalWorkflowInstanceData)
            // return {
            //      message: 'Workflow instance updated successfully',
            //      data: finalWorkflowInstanceData,
            // };
        } catch (error) {
            logger.error('WorkflowService --> updateWorkflowInstanceById  --> error', error);
            throw error;
        }
    }

    async updateMetadata(data: any): Promise<any> {
        try {
            const { type, assetId, instanceId } = data;
            const assetDoc = await this.workflowRepository.getAssetDataByTypeAndId(assetId);
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
