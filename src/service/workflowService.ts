import { WorkflowRepository as MYSQLWorkflowRepository } from "../dao/mysql/workflowDao";
import { AuditLogger } from "../utils/audit";
import logger from "../utils/logger";
import createHttpError from "http-errors";
import { StatusCodes } from "http-status-codes";
import {
  createWorkflowInstanceSchema,
  stageSchema,
  updateStageSchema,
  updateWorkflowInstanceSchema,
  workflowSchema,
} from "../validator/createWorkflowSchema";
import moment from "moment";
import { spec } from "node:test/reporters";
import { handlerFunctionSpecifications } from "../dao/mysql/workflowFieldConfig";
import { FileSystem } from "./FileSystem";
import * as Minio from "minio";
import { exist } from "joi";
import { dbConnection } from "../dbConnection/mongo";

export class WorkflowService {
  private workflowRepository: MYSQLWorkflowRepository;

  constructor() {
    this.workflowRepository = new MYSQLWorkflowRepository();
  }

  handlerFunctions: any = {
    createSummary: this.updateMetadata,
    endWorkflowHandler: this.endWorkflowInstance,
    leaveBalanceReducer: this.leaveBalanceReducer.bind(this),
    documentRejectionHandler: this.documentRejectionHandler.bind(this),
    documentUploadHandler: this.documentUploadHandler.bind(this),
  };

  //Workflow Services
  async createWorkflow(workflowData: any, userDetails: any) {
    try {
      logger.info("WorkflowService --> createWorkflow  --> data", workflowData);
      AuditLogger.logAction("createWorkflow", { workflowData });
      const { error } = workflowSchema.validate(workflowData);
      if (error) {
        throw createHttpError(
          StatusCodes.BAD_REQUEST,
          error.details[0].message
        );
      }
      const workflowName = workflowData.name.trim();
      const isExistingWorkflowPresent =
        await this.workflowRepository.findWorkflowByName(workflowName);
      if (isExistingWorkflowPresent) {
        throw createHttpError(
          StatusCodes.CONFLICT,
          `Workflow with the name '${workflowName}' already exists`
        );
      }
      await this.validateStages(workflowData);
      await this.workflowRepository.createWorkflow(workflowData, userDetails);
      return {
        code: 0,
        message: `Workflow with the name '${workflowName}' created Successfully`,
      };
    } catch (error) {
      logger.error("WorkflowService --> createWorkflow  --> error", error);
      throw error;
    }
  }

  async validateStages(workflowData: any) {
    try {
      logger.info(
        "WorkflowService --> isStartStageorEndStageDuplicated --> data",
        workflowData
      );
      AuditLogger.logAction("isStartStageorEndStageDuplicated", {
        workflowData,
      });
      const isStartStageDuplicated = workflowData.stages.filter(
        (stage: any) => stage.isStart === true
      );
      if (isStartStageDuplicated.length > 1) {
        throw createHttpError(
          StatusCodes.UNPROCESSABLE_ENTITY,
          "Only one stage can be Start Stage"
        );
      } else if (isStartStageDuplicated.length === 0) {
        throw createHttpError(
          StatusCodes.UNPROCESSABLE_ENTITY,
          "No Start stage provided"
        );
      }
      const isEndStageDuplicated = workflowData.stages.filter(
        (stage: any) => stage.isEnd === true
      );
      if (isEndStageDuplicated.length > 1) {
        throw createHttpError(
          StatusCodes.UNPROCESSABLE_ENTITY,
          "Only one stage can be End Stage"
        );
      } else if (isEndStageDuplicated.length === 0) {
        throw createHttpError(
          StatusCodes.UNPROCESSABLE_ENTITY,
          "No end stage provided"
        );
      }
      const ids = workflowData.stages.map((stage: any) => stage.id);
      const uniqueIds = new Set(ids);
      if (ids.length !== uniqueIds.size) {
        throw createHttpError(
          StatusCodes.UNPROCESSABLE_ENTITY,
          "Duplicate stage IDs found. Each stage must have a unique id."
        );
      }
      const errors: any = [];
      workflowData.stages.forEach((stage: any, index: any) => {
        const isNextPossibleActionPresent = stage?.nextPossibleActions;
        let nextPossibleActionLength;
        let isDecisionCorrect;
        if (
          (isNextPossibleActionPresent && stage?.isDecision === undefined) ||
          (!isNextPossibleActionPresent && stage?.isDecision !== undefined)
        ) {
          throw createHttpError(
            StatusCodes.UNPROCESSABLE_ENTITY,
            `'isDecision' must be present only when 'nextPossibleActions' is present, and vice versa.`
          );
        }
        if (isNextPossibleActionPresent) {
          nextPossibleActionLength = stage?.nextPossibleActions?.length;
          isDecisionCorrect =
            (nextPossibleActionLength > 1 && stage?.isDecision === true) ||
            (nextPossibleActionLength <= 1 && stage?.isDecision === false);
          const isDecision = stage.isDecision;
          if (!isDecisionCorrect) {
            errors.push(
              `Stage at index ${index} with name '${stage.name}': ` +
                (isDecision === undefined
                  ? "isDecision is not present"
                  : `isDecision must be ${
                      nextPossibleActionLength > 1 ? "true" : "false"
                    } when nextPossibleActions length is ${nextPossibleActionLength}`)
            );
          }
        }
      });
      if (errors.length > 0) {
        throw createHttpError(
          StatusCodes.UNPROCESSABLE_ENTITY,
          errors.join("  ")
        );
      }
    } catch (error) {
      logger.error("WorkflowService --> createWorkflow  --> error", error);
      throw error;
    }
  }

  async getAllWorkflows() {
    try {
      logger.info("WorkflowService --> getAllWorkflows");
      const workflows = await this.workflowRepository.getAllWorkflows();
      return workflows.map((workflow: any) => {
        return { ...workflow, isActive: workflow.isActive === 1 };
      });
    } catch (error) {
      logger.error("WorkflowService --> getAllWorkflows  --> error", error);
      throw error;
    }
  }

  async getWorkflowById(workflowId: string) {
    try {
      logger.info("WorkflowService --> getWorkflowById");
      const workflow = await this.workflowRepository.getWorkflowById(
        workflowId
      );
      if (workflow.length === 0) {
        throw createHttpError(
          StatusCodes.NOT_FOUND,
          `Workflow does not exists`
        );
      }
      return [workflow].map((workflow: any) => {
        return { ...workflow, isActive: workflow.isActive === 1 };
      });
    } catch (error) {
      logger.error("WorkflowService --> getWorkflowById  --> error", error);
      throw error;
    }
  }

  async updateWorkflowById(
    workflowId: string,
    updatedData: any,
    userDetails: any
  ) {
    try {
      logger.info(
        "WorkflowService --> updateWorkflowById  --> data",
        updatedData
      );
      AuditLogger.logAction("updateWorkflowById", { updatedData });
      const { error } = workflowSchema.validate(updatedData);
      if (error) {
        throw createHttpError(
          StatusCodes.BAD_REQUEST,
          error.details[0].message
        );
      }
      updatedData.name = updatedData.name.trim();
      const isExistingWorkflowPresent =
        await this.workflowRepository.findWorkflowDuplicateName(
          workflowId,
          updatedData.name
        );
      if (isExistingWorkflowPresent) {
        throw createHttpError(
          StatusCodes.CONFLICT,
          `Workflow with the name '${updatedData.name}' already exists`
        );
      }
      await this.validateStages(updatedData);
      await this.workflowRepository.updateWorkflowById(
        workflowId,
        updatedData,
        userDetails
      );
      return { code: 0, message: "Workflow updated successfully" };
    } catch (error) {
      logger.error("WorkflowService --> updateWorkflowById  --> error", error);
      throw error;
    }
  }

  async activateWorkflow(workflowId: string) {
    try {
      logger.info("WorkflowService --> getWorkflowById");
      const workflow = await this.workflowRepository.getWorkflowById(
        workflowId
      );
      if (workflow.length === 0) {
        throw createHttpError(
          StatusCodes.NOT_FOUND,
          `Workflow does not exists`
        );
      }
      const newStatus = !(workflow.isActive === 1);
      await this.workflowRepository.activateWorkflow(workflowId, newStatus);
      return newStatus
        ? { code: 0, message: "Workflow enabled successfully" }
        : { code: 0, message: "Workflow disabled successfully" };
    } catch (error) {
      logger.error("WorkflowService --> getWorkflowById  --> error", error);
      throw error;
    }
  }

  //Stage Services
  async createStage(stageData: any, userDetails: any) {
    try {
      logger.info("WorkflowService --> createStage  --> data", stageData);
      AuditLogger.logAction("createStage", { stageData });
      const { error } = stageSchema.validate(stageData);
      if (error) {
        throw createHttpError(
          StatusCodes.BAD_REQUEST,
          error.details[0].message
        );
      }
      stageData.name = stageData.name.trim();
      await this.workflowRepository.createStage(stageData, userDetails);
      return {
        code: 0,
        message: `Stage with the name '${stageData.name}' created successfully`,
      };
    } catch (error) {
      logger.error("WorkflowService --> createWorkflow  --> error", error);
      throw error;
    }
  }

  async getAllStages() {
    try {
      logger.info("WorkflowService --> getAllStages");
      const stages = await this.workflowRepository.getAllStages();
      return stages;
    } catch (error: any) {
      logger.error("WorkflowService --> getStageById  --> error", error);
      throw error;
    }
  }

  async getStageById(stageId: string) {
    try {
      logger.info("WorkflowService --> getStageById  --> data", stageId);
      AuditLogger.logAction("getStageById", { stageId });
      const isStagePresentForId = await this.workflowRepository.getStageById(
        stageId
      );
      if (isStagePresentForId === null) {
        throw createHttpError(StatusCodes.NOT_FOUND, `Stage does not exists`);
      }
      return isStagePresentForId;
    } catch (error: any) {
      logger.error("WorkflowService --> getStageById  --> error", error);
      throw error;
    }
  }

  async updateStageById(stageId: string, updatedData: any, userDetails: any) {
    try {
      logger.info("WorkflowService --> updateStageById  --> data", updatedData);
      AuditLogger.logAction("updateWorkflowById", { updatedData });
      const { error } = updateStageSchema.validate(updatedData);
      if (error) {
        throw createHttpError(
          StatusCodes.BAD_REQUEST,
          error.details[0].message
        );
      }
      const isStagePresent = await this.workflowRepository.getStageById(
        stageId
      );
      if (!isStagePresent) {
        throw createHttpError(StatusCodes.NOT_FOUND, `Stage not found`);
      }
      const isDuplicateStage =
        await this.workflowRepository.findStageDuplicatName(
          stageId,
          updatedData.name
        );
      if (isDuplicateStage) {
        throw createHttpError(
          StatusCodes.CONFLICT,
          `Stage with the name '${updatedData.name}' already exists`
        );
      }
      await this.workflowRepository.updateStageById(
        stageId,
        updatedData,
        userDetails
      );
      return {
        code: 0,
        message: `Stage with the name '${updatedData.name}' updated successfully`,
      };
    } catch (error) {
      logger.error("WorkflowService --> updateWorkflowById  --> error", error);
      throw error;
    }
  }

  async activateStage(stageId: string) {
    try {
      logger.info("WorkflowService --> activateStage");
      const stage = await this.workflowRepository.getStageById(stageId);
      if (!stage) {
        throw createHttpError(StatusCodes.NOT_FOUND, `Stage does not exists`);
      }
      const newStatus = !(stage[0].isActive === true);
      await this.workflowRepository.activateStage(stageId, newStatus);

      return newStatus
        ? { code: 0, message: "Stage enabled successfully" }
        : { code: 0, message: "Stage disabled successfully" };
    } catch (error) {
      logger.error("WorkflowService --> activateStage  --> error", error);
      throw error;
    }
  }

  async deleteStage(stageId: string) {
    try {
      logger.info("WorkflowService --> deleteStage");
      const stage = await this.workflowRepository.getStageById(stageId);
      if (!stage) {
        throw createHttpError(StatusCodes.NOT_FOUND, `Stage does not exists`);
      }
      await this.workflowRepository.deleteStage(stageId);
      return  { code: 0, message: "Stage deleted successfully" }
    } catch (error) {
      logger.error("WorkflowService --> deleteStage  --> error", error);
      throw error;
    }
  }

  async getAsset(assetId: any, type: string) {
    try {
      logger.info("WorkflowService --> getAsset --> assetId", assetId);
      const documentData =
        await this.workflowRepository.getAssetDataByTypeAndId(assetId, type);
      if (!documentData) {
        throw createHttpError(StatusCodes.NOT_FOUND, "Document not found");
      }
      return documentData;
    } catch (error) {
      logger.error(
        "WorkflowService --> getWorkflowDefinition  --> error",
        error
      );
      throw error;
    }
  }

  async getWorkflowDefinition(workflowId: string) {
    try {
      logger.info(
        "WorkflowService --> getWorkflowDefinition --> id",
        workflowId
      );
      const workflowDefinition = await this.workflowRepository.getWorkflowById(
        workflowId
      );
      if (!workflowDefinition) {
        throw createHttpError(
          StatusCodes.BAD_REQUEST,
          `No Workflow present for the id ${workflowId}`
        );
      }
      return workflowDefinition;
    } catch (error) {
      logger.error(
        "WorkflowService --> getWorkflowDefinition  --> error",
        error
      );
      throw error;
    }
  }

  async findStartStage(stages: any) {
    try {
      logger.info("WorkflowService --> findStartStage --> stages", stages);
      const startStage = stages.find((stage: any) => stage.isStart === true);
      if (!startStage.isStart) {
        throw new Error("No start stage is defined in the workflow");
      }
      return startStage;
    } catch (error) {
      logger.error("WorkflowService --> findStartStage  --> error", error);
      throw error;
    }
  }

  async createInstanceData(
    assetId: any,
    type: string,
    workflowId: any,
    workflowName: any,
    startStage: any,
    userId: any,
    userName: any,
    currentAllowedRoles: any,
    currentAllowedUsers: any,
    requestedData: any
  ) {
    try {
      logger.info("WorkflowService --> createInstanceData --> stages", assetId);
      console.log('requestedData inside func is',requestedData)
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
        history: [
          {
            stageId: startStage.id,
            stageName: startStage.name,
            performedBy: userName,
            timestamp: moment().format("YYYY-MM-DD HH:mm:ss"),
            ...(requestedData &&
              Object.keys(requestedData).length > 0 && {
                request: Object.entries(requestedData).map(([key, value]) => ({
                  label: key,
                  value: value,
                })),
              }),
          },
        ],
        createdAt: moment().format("YYYY-MM-DD HH:mm:ss"),
        requestedData,
      };
    } catch (error) {
      logger.error("WorkflowService --> createInstanceData  --> error", error);
      throw error;
    }
  }

  async updateAssetWithSuggestedMetadata(
    type: any,
    id: any,
    assetData: any,
    newWorkflowRequest: any
  ) {
    try {
      logger.info(
        "WorkflowService --> updateAssetWithSuggestedMetadata --> id",
        id
      );
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
            requestedData: requestedData
              ? requestedData
              : assetData?.workflowRequests?.[index]?.requestedData || {},
            ...newWorkflowRequest,
          };
        } else {
          assetData.workflowRequests.push(newWorkflowRequest);
        }
      }
      await this.workflowRepository.updateSuggestedAssetData(
        type,
        id,
        assetData.workflowRequests
      );
    } catch (error) {
      console.error(
        "workflowService --> updateAssetWithSuggestedMetadata --> error ::",
        error
      );
      throw error;
    }
  }

  // async getAllowedRolesAndUsers(nextStages: any, stages: any) {
  //     console.log('called ehre');
  //     try {
  //         logger.info('WorkflowService --> getAllowedRolesAndUsers --> nextStages',nextStages);
  //         const currentAllowedRoles = nextStages?.flatMap((action: any) => {
  //             const matchingStage = stages?.find((stage: any) => stage.id === action.id);
  //             return matchingStage?.allowedRoles || [];
  //         }) || [];
  //         const currentAllowedUsers = nextStages?.nextPossibleActions?.flatMap((action: any) => {
  //             const matchingStage = stages?.stages?.find((stage: any) => stage.id === action.id);
  //             return matchingStage?.allowedUsers || [];
  //         }) || [];
  //         console.log('current Allowed ROles',currentAllowedRoles);
  //         console.log('curent allwoed user ',currentAllowedUsers);
  //         return { currentAllowedRoles, currentAllowedUsers };
  //     } catch (error) {
  //         logger.error('WorkflowService --> getAllowedRolesAndUsers  --> error', error);
  //         throw error;
  //     }
  // }

  //WorkflowInstanceServices

  async createWorkflowInstance(workflowInstanceData: any, userDetails: any) {
    try {
      logger.info(
        "WorkflowService --> createWorkflowInstance  --> data",
        workflowInstanceData
      );
      AuditLogger.logAction("createWorkflowInstance", { workflowInstanceData });
      const { error } =
        createWorkflowInstanceSchema.validate(workflowInstanceData);
      if (error) {
        throw createHttpError(
          StatusCodes.BAD_REQUEST,
          error.details[0].message
        );
      }
      const { assetId, workflowId, type, requestedData } = workflowInstanceData;
      const { userId, userName } = userDetails;
      const workflowDefinition = await this.getWorkflowDefinition(workflowId);
      const assetData = await this.getAsset(assetId, type);
      const startStage = await this.findStartStage(workflowDefinition.stages);
      const currentAllowedUsers = startStage?.allowedUsers || [];
      const currentAllowedRoles = startStage?.allowedRoles || [];
      const instanceData = await this.createInstanceData(
        assetId,
        type,
        workflowId,
        workflowDefinition.name,
        startStage,
        userId,
        userName,
        currentAllowedRoles,
        currentAllowedUsers,
        requestedData
      );
      const newInstance = await this.workflowRepository.addWorkflowInstance(
        instanceData,
        userDetails
      );
      const newWorkflowRequest = {
        instanceId: newInstance.id,
        workflowId,
        workflowName: workflowDefinition.name,
        currentStage: startStage.name,
        status: startStage.status,
        possibleActions: startStage.nextPossibleActions || [],
        currentAllowedRoles: startStage?.allowedRoles || [],
        currentAllowedUsers: startStage?.allowedUsers || [],
        requestedBy: userName,
        user_id: userId,
        requestedAt: moment().format("YYYY-MM-DD HH:mm:ss"),
      };
      await this.updateAssetWithSuggestedMetadata(
        type,
        assetId,
        assetData,
        newWorkflowRequest
      );
      return {
        message: "Workflow instance created successfully",
        data: newInstance,
      };
    } catch (error) {
      logger.error(
        "WorkflowService --> createWorkflowInstance  --> error",
        error
      );
      throw error;
    }
  }

  async getWorkflowInstance(instanceId: any) {
    try {
      logger.info(
        "WorkflowService --> getWorkflowInstance  --> instanceId",
        instanceId
      );
      AuditLogger.logAction("getWorkflowInstance", { instanceId });
      const workflowInstanceData =
        await this.workflowRepository.getWorkflowInstanceById(instanceId);
      if (!workflowInstanceData) {
        throw createHttpError(
          StatusCodes.NOT_FOUND,
          "Workflow instance not found"
        );
      }
      return workflowInstanceData;
    } catch (error) {
      logger.error("WorkflowService --> getWorkflowInstance  --> error", error);
      throw error;
    }
  }

  async getAllWorkflowInstances(data: any, userId: any) {
    try {
      logger.info(
        "WorkflowService --> getAllWorkflowInstances  --> data",
        data
      );
      AuditLogger.logAction("getAllWorkflowInstances", { data });
      const user = await this.workflowRepository.getUserDetails(userId);
      if (!user) {
        throw createHttpError(StatusCodes.NOT_FOUND, "User not found");
      }
      const workflowInstances =
        await this.workflowRepository.getAllWorkflowInstanceByUser(
          user?.role,
          user?.emailId
        );
      return workflowInstances;
    } catch (error) {
      logger.error(
        "WorkflowService --> getAllWorkflowInstances  --> error",
        error
      );
      throw error;
    }
  }

  async findStageById(stages: any, stageId: any) {
    try {
      logger.info("WorkflowService --> findStageById  --> data", stageId);
      AuditLogger.logAction("findStageById", { stages, stageId });
      const stage = stages.find((stage: any) => stage.id === stageId);
      if (!stage) {
        throw createHttpError(StatusCodes.NOT_FOUND, "Stage not found");
      }
      return stage;
    } catch (error) {
      logger.error("WorkflowService --> endWorkflowInstance  --> error", error);
      throw error;
    }
  }

  async updateHistory(
    history: any[],
    nextStage: any,
    userName: any,
    inputData: any
  ) {
    try {
      let rejectedReason;
      if (inputData?.nextStageHandlerInput?.rejectedReason) {
        rejectedReason = inputData?.nextStageHandlerInput?.rejectedReason;
      }
      const length = history.length;
      const lastEntryStage = history[length - 1];
      let statusFlag = 0;

      if (lastEntryStage.stageId !== nextStage.id) {
        statusFlag = 0;
        const currentStageEntry = {
          stageId: lastEntryStage.stageId,
          stageName: lastEntryStage.stageName,
          performedBy: userName,
          timeStamp: moment().format("YYYY-MM-DD HH:mm:ss"),
          status: inputData?.currentStageInput?.status || null,
          comments:
            inputData?.currentStageInput?.comments ||
            inputData?.nextStageHandlerInput?.rejectedReason,
          reason: inputData?.handlerInput?.rejectedReason
            ? inputData?.handlerInput?.rejectedReason
            : null,
        };
        const transitionEntry = {
          stageId: nextStage.id,
          status: nextStage?.isEnd ? "Completed" : "In Progress",
          stageName: nextStage.name,
          timeStamp: moment().format("YYYY-MM-DD HH:mm:ss"),
        };
        history.push(currentStageEntry);
        history.push(transitionEntry);
      } else {
        statusFlag = 1;
        const currentStageEntry = {
          stageId: nextStage.id,
          stageName: nextStage.name,
          performedBy: userName,
          timeStamp: moment().format("YYYY-MM-DD HH:mm:ss"),
          status: inputData?.currentStageInput?.status || null,
          comments: inputData?.currentStageInput?.comments,
          reason: inputData?.handlerInput?.rejectedReason
            ? inputData?.handlerInput?.rejectedReason
            : null,
        };
        history.push(currentStageEntry);
      }
      return history;
    } catch (error) {
      logger.error("WorkflowService --> updateHistory  --> error", error);
      throw error;
    }
  }

  // async updateHistory(history: any[], stage: any, user: any) {
  //      try {
  //         console.log('Updating workflow history');
  //         let newHistoryEntry: any = {
  //             stageId: stage.id,
  //             stageName: stage.name,
  //             performedBy: user,
  //             timeStamp: moment().format('YYYY-MM-DD HH:mm:ss')
  //         };
  //         const existingEntryIndex = history.findIndex((entry: any) => entry.stageId === stage.id);
  //         if (existingEntryIndex !== -1) {
  //             console.log('coming here');
  //             history[existingEntryIndex] = { ...history[existingEntryIndex], ...newHistoryEntry };
  //         } else {
  //             history.push(newHistoryEntry);
  //         }
  //         return history;
  //     } catch (error) {
  //         console.error('workflowService --> updateHistory --> error ::', error);
  //         throw error;
  //     }
  // }

  async updateInstanceData(
    instanceData: any,
    stage: any,
    userName: any,
    currentAllowedRoles: any,
    currentAllowedUsers: any,
    inputData: any
  ) {
    try {
      logger.info(
        "WorkflowService --> updateInstanceData  --> instanceData",
        instanceData
      );

      //instanceData[0].requestedData = (requestedData && Object.keys(requestedData)?.length > 0) ? requestedData : instanceData?.requestedData || {};
      instanceData[0].current_stage = stage.name;
      instanceData[0].status = stage.status;
      instanceData[0].possible_actions = stage?.isEnd
        ? null
        : stage?.nextPossibleActions;
      instanceData[0].current_allowed_roles = currentAllowedRoles;
      instanceData[0].current_allowed_users = currentAllowedUsers;
      instanceData[0].history = await this.updateHistory(
        instanceData[0].history,
        stage,
        userName,
        inputData
      );
      return instanceData;
    } catch (error) {
      logger.error("WorkflowService --> updateInstanceData  --> error", error);
      throw error;
    }
  }

  async validateStageTransition(possible_actions: any, stageId: string) {
    const isAllowed = possible_actions.find(
      (nextPossibleAction: any) => nextPossibleAction.id === stageId
    );
    if (!isAllowed) {
      throw createHttpError(
        StatusCodes.BAD_REQUEST,
        "Invalid stage transition: not allowed from current stage."
      );
    }
  }

  // async getWorkflowInstanceByDocId(docId: any) {
  //     const instance = await this.workflowRepository.getWorkflowInstanceByDocId(docId);
  //     return instance;
  // }

  async handleWorkflowActionUpdate(assetId: string, actions: any[]) {
  const groupedChanges: Record<string, any> = {}; // entity -> { field: value }

  for (const action of actions) {
    const { entityType, field, operator } = action;

    if (!groupedChanges[entityType]) {
      groupedChanges[entityType] = {};
    }

    if (!groupedChanges[entityType][field]) {
      groupedChanges[entityType][field] = {};
    }

    for (const op in operator) {
      const objectList = operator[op];

      for (const obj of objectList) {
        const key = Object.keys(obj)[0];
        const value = obj[key];

        if (op === "add" || op === "copyFrom" || op === "copyTo") {
          groupedChanges[entityType][field][key] = value;
        } else if (op === "remove") {
          if (!groupedChanges[entityType][field]._remove) {
            groupedChanges[entityType][field]._remove = [];
          }
          groupedChanges[entityType][field]._remove.push(key);
        }
      }
    }
  }

  for (const entity of Object.keys(groupedChanges)) {
    const fieldsMap = groupedChanges[entity];
    for (const field of Object.keys(fieldsMap)) {
      const fieldValue = fieldsMap[field];
      await this.workflowRepository.updateSuggestedChangesWorkflow(
        assetId,
        entity,
        field,
        fieldValue
      );
    }
  }
}



  async updateWorkflowInstanceById(
    instanceId: any,
    data: any,
    userDetails: any,
    documentInfo: any,
    isDocUploaded: boolean
  ) {
    try {
      logger.info(
        "WorkflowService --> updateWorkflowInstanceById  --> data",
        data
      );
      AuditLogger.logAction("updateWorkflowInstanceById", { data });
      const fileSystem = new FileSystem("minio");
      const { workflowId, assetId, stageId, type, inputData } = data;
      console.log('data around me',data)
      if (isDocUploaded) {
        const existingFileName: any = await fileSystem.getDocumentForAssetId(
          assetId
        );
        const newFileName = documentInfo?.fileInfo?.originalname;
        if (existingFileName !== newFileName) {
          throw createHttpError(
            StatusCodes?.BAD_REQUEST,
            `File name mismatch: Please upload a file with the same name as the original ${existingFileName}`
          );
        }
      }
      const { userId, userName } = userDetails;
      const workflowInstanceData = await this.getWorkflowInstance(instanceId);
      const requestedData = workflowInstanceData[0]?.requestedData;
      console.log("workflowInstanceData xxx", workflowInstanceData);
      const workflowDefinition = await this.getWorkflowDefinition(workflowId);
      console.log("defintoin si", workflowDefinition);
      const assetData = await this.getAsset(assetId, type);
      const stage = await this.findStageById(
        workflowDefinition?.stages,
        stageId
      );
      console.log("stage stage stage", stage);
      //await this.validateStageTransition(workflowInstanceData[0]?.possible_actions, stageId);
      // const { currentAllowedRoles, currentAllowedUsers } = await this.getAllowedRolesAndUsers(stage?.nextPossibleActions, workflowDefinition?.stages);
      console.log('input Data is what buddy',inputData);
      const currentAllowedUsers = stage?.allowedUsers || [];
      const currentAllowedRoles = stage?.allowedRoles || [];
      console.log("current users", currentAllowedUsers);
      console.log('inputData is')
      if(inputData?.actions.length > 0) {
        await this.handleWorkflowActionUpdate(assetId, inputData?.actions)
      }
            
      let updatedInstanceData = await this.updateInstanceData(
        workflowInstanceData,
        stage,
        userName,
        currentAllowedRoles,
        currentAllowedUsers,
        inputData
      );
      console.log("updated Instance Data is", updatedInstanceData);
      const newWorkflowRequest = {
        instanceId: instanceId,
        workflowId,
        workflowName: workflowDefinition.name,
        currentStage: stage.name,
        status: stage.status,
        possibleActions: stage?.isEnd ? null : stage.nextPossibleActions,
        current_allowed_roles: currentAllowedRoles,
        current_allowed_users: currentAllowedUsers,
        requestedData: requestedData,
        performedBy: userName,
        user_id: userId,
        lastModifiedAt: moment().format("YYYY-MM-DD HH:mm:ss"),
      };
      await this.workflowRepository.updateWorkflowInstanceById(
        instanceId,
        updatedInstanceData
      );
      await this.updateAssetWithSuggestedMetadata(
        type,
        assetId,
        assetData,
        newWorkflowRequest
      );
      console.log("stage is what bro", stage);
      // if (stage.actionType === "handler") {
      //   type HandlerFunctionName = keyof typeof handlerFunctionSpecifications;

      //   // Step 2: Helper to check if handler needs user input based on `source: 'user'`
      //   function handlerNeedsUserInput(
      //     handler: (typeof handlerFunctionSpecifications)[HandlerFunctionName]
      //   ): boolean {
      //     return Object.values(handler.inputParams).some(
      //       (param) => param.source === "user"
      //     );
      //   }
      //   console.log("function to be called here working or not");
      //   const handlerFunction = this.handlerFunctions[stage.handlerFunction];
      //   console.log("handlerFunction is", handlerFunction);
      //   if (!handlerFunction) {
      //     console.log("called inside if part");
      //     throw createHttpError(
      //       StatusCodes.INTERNAL_SERVER_ERROR,
      //       "Handler function not found"
      //     );
      //   } else {
      //     console.log(
      //       "workflowInstanceData?.requestedData",
      //       workflowInstanceData[0]?.requestedData
      //     );
      //     await handlerFunction(
      //       documentInfo,
      //       stage?.specification,
      //       assetId,
      //       userName,
      //       assetData,
      //       workflowId,
      //       workflowDefinition,
      //       stage,
      //       inputData,
      //       workflowInstanceData[0]?.requestedData,
      //       instanceId,
      //       type
      //     );
      //   }
      //   // else {
      //   if (!stage.isEnd) {
      //     if (stage.nextPossibleActions?.length > 0) {
      //       const nextStage = await this.findStageById(
      //         workflowDefinition?.stages,
      //         stage?.nextPossibleActions[0]?.id
      //       );
      //       const nextHandlerKey =
      //         nextStage.handlerFunction as HandlerFunctionName;
      //       const nextHandlerDefinition =
      //         handlerFunctionSpecifications[nextHandlerKey];
      //       const nextNeedsInput =
      //         nextStage?.actionType === "handler" &&
      //         nextHandlerDefinition &&
      //         handlerNeedsUserInput(nextHandlerDefinition);

      //       if (nextNeedsInput) {
      //         console.log(
      //           "Next handler requires input. Pausing workflow here."
      //         );
      //         return {
      //           message: "Workflow instance updated successfully",
      //         };
      //       }

      //       const currentAllowedUsers = nextStage?.allowedUsers || [];
      //       const currentAllowedRoles = nextStage?.allowedRoles || [];
      //       const nextInstanceData = {
      //         instanceId,
      //         assetId,
      //         workflowId,
      //         stageId: nextStage?.id,
      //         currentAllowedRoles: currentAllowedRoles,
      //         currentAllowedUsers: currentAllowedUsers,
      //         possibleActions: nextStage?.isEnd
      //           ? null
      //           : nextStage?.nextPossibleActions,
      //         user_id: "system",
      //         performedBy: "system",
      //         user: "system",
      //         type,
      //       };
      //       console.log("nextInstanceData", nextInstanceData);
      //       console.log("going to be called second time check");
      //       await this.updateWorkflowInstanceById(
      //         instanceId,
      //         nextInstanceData,
      //         userDetails,
      //         documentInfo,
      //         false
      //       );
      //     } else {
      //       this.endWorkflowInstance(updatedInstanceData, workflowDefinition);
      //     }
      //   } else {
      //     console.log("called ehre please");
      //     this.endWorkflowInstance(updatedInstanceData, workflowDefinition);
      //   }
      // } else {
      //   if (stage.nextPossibleActions?.length === 0) {
      //     this.endWorkflowInstance(updatedInstanceData, workflowDefinition);
      //   }
      // }
      // const finalWorkflowInstanceData = await this.getWorkflowInstance(instanceId);
      return {
        message: "Workflow instance updated successfully",
        //     data: finalWorkflowInstanceData,
      };
    } catch (error) {
      logger.error(
        "WorkflowService --> updateWorkflowInstanceById  --> error",
        error
      );
      throw error;
    }
  }

  async updateMetadata(data: any): Promise<any> {
    try {
      const { type, assetId, instanceId } = data;
      const assetDoc = await this.workflowRepository.getAssetDataByTypeAndId(
        assetId,
        type
      );
      if (!assetDoc) {
        throw createHttpError(StatusCodes.NOT_FOUND, "Asset not found");
      }
      const assetData = assetDoc;
      const workflowRequests = assetData?.workflowRequests || [];
      const instanceData = workflowRequests.find(
        (request: any) => request.instanceId === instanceId
      );
      if (!instanceData) {
        throw createHttpError(
          StatusCodes.NOT_FOUND,
          "Workflow instance not found"
        );
      }
      const requestedData = instanceData?.requestedData || {};
      for (const field in requestedData) {
        const fieldUpdate = requestedData[field];
        if (typeof assetData[field] === "string") {
          if (fieldUpdate.add) {
            assetData[field] = fieldUpdate.add;
          }
        } else if (Array.isArray(assetData[field])) {
          if (fieldUpdate.add) {
            assetData[field] = [...assetData[field], ...fieldUpdate.add];
          }
          if (fieldUpdate.remove) {
            assetData[field] = assetData[field].filter(
              (item: any) => !fieldUpdate.remove.includes(item)
            );
          }
        }
      }
      await this.workflowRepository.updateAssetData(type, assetId, assetData);
      return { message: "Metadata updated successfully" };
    } catch (error) {
      logger.error("WorkflowService --> updateMetadata  --> error", error);
      throw error;
    }
  }

  async endWorkflowInstance(data: any, workflowDefinition: any) {
    console.log("data is", data);
    try {
      logger.info("WorkflowService --> endWorkflowInstance  --> data", data);
      AuditLogger.logAction("endWorkflowInstance", { data });
      const { id, asset_id, asset_type } = data[0];

      console.log("inside End Workflow Bro");
      const assetData = await this.workflowRepository.getAssetDataByTypeAndId(
        asset_id,
        asset_type
      );
      console.log("workFlowDefintion is", workflowDefinition);
      console.log("assetData assetData", assetData);
      if (!assetData) {
        throw createHttpError(StatusCodes.NOT_FOUND, "Asset not found");
      }
      // const endStage = this.workflowRepository.getStageById()
      // assetData[0].workflowRequests = assetData[0]?.workflowRequests?.filter(
      //     (request: any) => request.id !== id
      // );
      //await this.workflowRepository.updateSuggestedAssetData(asset_type, asset_id, assetData.workflowRequests);
    } catch (error) {
      logger.error("WorkflowService --> endWorkflowInstance  --> error", error);
      throw error;
    }
  }

  async leaveBalanceReducer(
    documentInfo: any = null,
    specification: any,
    assetId: string,
    userName: any,
    assetData: any,
    workflowId: any,
    workflowDefinition: any,
    nextStage: any,
    inputData: any,

    requestedData: any,
    instanceId: string,
    type: string
  ) {
    const leaveRequestInstanceData = await this.getWorkflowInstance(instanceId);
    if (!leaveRequestInstanceData) throw new Error("Leave request not found");
    console.log("leave ReqeustIsncae is", leaveRequestInstanceData);
    console.log("specificaiont is", specification);
    const userId = leaveRequestInstanceData[0].user_id;
    const userDetails = await this.workflowRepository.getUserDetails(userId);
    if (!userDetails) throw new Error("User not found");
    const leaveBalance = userDetails?.leaveBalance;
    if (leaveBalance < 0) {
      throw new Error("Not Enough Leave balance");
    }
    console.log("requestedData is", requestedData);
    await this.workflowRepository.updateUserLeaveBalance(
      userId,
      leaveBalance - requestedData?.leaveDays
    );
    return { code: 0, message: "Leave Updated Successfully" };
  }

  // async getWorkflowRequestedField(workflowType: string) {
  //     //return Object.keys(workflowFieldConfig[workflowType]?.requestedDataKeys || {})[0];
  //     const requestedData = workflowFieldConfig?.[workflowType as keyof typeof workflowFieldConfig]?.requestedDataKeys;
  //     return Object.keys(requestedData);
  // }

  // async updateFieldHandler(specification: any, requestedData: any, instanceId: any) {
  //     console.log('requestedData is inside whta bro',requestedData)
  //     const mapping = this.workflowFieldMappings[specification?.workflowType];
  //     if (!mapping) {
  //         throw new Error(`Unsupported workflowType: ${specification.workflowType}`);
  //     }
  //     const { entity, field } = mapping;
  //     const leaveRequestInstanceData = await this.getWorkflowInstance(instanceId);
  //     console.log('leaveRequestInstanceData',leaveRequestInstanceData)
  //     if (!leaveRequestInstanceData) throw new Error('Leave request not found');
  //     const userId = leaveRequestInstanceData[0].user_id;
  //     const userDetails = await this.workflowRepository.getUserDetails(userId);
  //     if (!userDetails) throw new Error('User not found');
  //     console.log('before')
  //     console.log('specification.worfklowType', specification?.workflowType)
  //     //const data = await this.getWorkflowRequestedField(specification?.workflowType);
  //     // console.log('requested data data data',requestedData[data[0]]);
  //     // await this.workflowRepository.updateFieldHandlerWorkflow(userId, entity, field, requestedData[data[0]]);
  //     return {
  //         code: 0,
  //         message: "Updated Successfully"
  //     }
  // }

  async getHandlerFunctionSpecification(handlerFunctionName: string) {
    const handlerSpec =
      handlerFunctionSpecifications[
        handlerFunctionName as keyof typeof handlerFunctionSpecifications
      ];
    if (!handlerSpec) {
      throw createHttpError(
        StatusCodes.BAD_REQUEST,
        "No Handler Function Found"
      );
    }
    return {
      handlerFunction: handlerFunctionName,
      inputParams: handlerSpec.inputParams,
    };
  }

  async getAllHandlers() {
    const handlers = Object.entries(handlerFunctionSpecifications).map(
      ([key, value]) => ({
        handlerFunction: key,
        name: value.name,
        inputParams: value.inputParams,
      })
    );
    return handlers;
  }

  async documentUploadHandler(
    documentInfo: any,
    specification: any,
    assetId: any
  ) {
    const fileSystem = new FileSystem("minio");
    const documentDetails: any = await fileSystem.getDocumentDetails(assetId);
    const result = await fileSystem.reUploadFile(
      documentInfo?.fileInfo,
      documentInfo?.userName,
      documentInfo?.directory,
      documentDetails
    );
  }

  async documentRejectionHandler(
    documentInfo: any = null,
    specification: any,
    assetId: string,
    userName: any,
    assetData: any,
    workflowId: any,
    workflowDefinition: any,
    nextStage: any,
    inputData: any,

    requestedData: any,
    instanceId: string,
    type: string
  ) {
    const workflowInstance = await this.getWorkflowInstance(instanceId);
    if (!workflowInstance || workflowInstance.length === 0) {
      throw new Error("Workflow instance not found");
    }
    const instance = workflowInstance[0];
    const initiatorId = instance.user_id;
    const initiatorName = instance.requestedBy;
    const newStatus = "Awaiting for Reupload";
    const nextHistoryEntry = {
      status: newStatus,
      stageId: nextStage?.id,
      stageName: nextStage?.name,
      timeStamp: moment().format("YYYY-MM-DD HH:mm:ss"),
      performedBy: "System/Handler",
      rejectionReason: inputData?.nextStageHandlerInput?.rejectionReason || "",
      comments: inputData?.nextStageHandlerInput?.comments || "",
    };
    const userDetails = await this.workflowRepository.getUserDetails(
      initiatorId
    );
    const emailId = userDetails?.emailId;

    const updatedHistory = Array.isArray(instance.history)
      ? [...instance.history, nextHistoryEntry]
      : [nextHistoryEntry];
    await this.workflowRepository.updateWorkflowInstanceById(instanceId, [
      {
        status: newStatus,
        current_allowed_users: [emailId],
        current_allowed_roles: [],
        history: updatedHistory,
      },
    ]);

    const newWorkflowRequest = {
      instanceId: instanceId,
      workflowId,
      workflowName: workflowDefinition.name,
      currentStage: nextStage.name,
      status: nextStage?.status,
      possibleActions: nextStage?.isEnd ? null : nextStage.nextPossibleActions,
      current_allowed_roles: [],
      current_allowed_users: [emailId],
      requestedData: requestedData,
      performedBy: "system",
    };
    await this.updateAssetWithSuggestedMetadata(
      type,
      assetId,
      assetData,
      newWorkflowRequest
    );
    return {
      code: 1,
      message: "Workflow sent back to initiator for document reupload",
    };
  }
}
