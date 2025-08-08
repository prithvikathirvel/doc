import { WorkflowRepository as MYSQLWorkflowRepository } from "../dao/mysql/workflowDao";
import { AuditLogger } from "../utils/audit";
import logger from "../utils/logger";
import createHttpError from "http-errors";
import { StatusCodes } from "http-status-codes";
import {
  stageSchema,
  updateStageSchema,
  workflowSchema,
} from "../validator/createWorkflowSchema";
import moment from "moment";
import { spec } from "node:test/reporters";
import { handlerFunctionSpecifications } from "../dao/mysql/workflowFieldConfig";
import { FileSystem } from "./FileSystem";
import * as Minio from "minio";
import { exist } from "joi";
import { dbConnection } from "../dbConnection/mongo";
import { start } from "repl";

export class WorkflowService {
  private workflowRepository: MYSQLWorkflowRepository;

  constructor() {
    this.workflowRepository = new MYSQLWorkflowRepository();
  }

  handlerFunctions: any = {};

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
        (stage: any) => stage?.nodeType === "start"
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
        (stage: any) => stage.nodeType === "end"
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
      const ids = workflowData?.stages?.map((stage: any) => stage.id);
      const uniqueIds = new Set(ids);
      if (ids.length !== uniqueIds.size) {
        throw createHttpError(
          StatusCodes.UNPROCESSABLE_ENTITY,
          "Duplicate stage IDs found. Each stage must have a unique id."
        );
      }
      const errors: any = [];
      workflowData?.stages?.map((stage: any) => {
        const name = stage.name;
        if (stage?.actionType === "handler" && stage?.handlerFunction === "") {
          errors.push(`Stage "${name}" does not has handler function`);
        }
        if (stage?.status === "") {
          errors.push(`Stage "${name}" does not has status`);
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
      return { code: 0, message: "Stage deleted successfully" };
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

      const startStage = stages.find(
        (stage: any) => stage?.nodeType === "start"
      );
      if (!startStage) {
        throw new Error("No start stage is defined in the workflow");
      }
      return startStage;
    } catch (error) {
      logger.error("WorkflowService --> findStartStage  --> error", error);
      throw error;
    }
  }

  async createInstanceData(
    assetId: string,
    type: string,
    workflowId: string,
    workflowName: string,
    startStage: any,
    userId: string,
    userName: string,
    currentAllowedRoles: any,
    currentAllowedUsers: any,
  ) {
    try {
      logger.info("WorkflowService --> createInstanceData --> stages", assetId);
      return {
        workflowId,
        workflowName,
        currentStage: startStage?.name,
        currentStageId: startStage?.id,
        status: startStage?.status,
        possibleActions: startStage?.nextPossibleActions,
        currentAllowedRoles,
        currentAllowedUsers,
        assetId,
        assetType: type,
        requestedBy: userName,
        userId,
        history: [
          {
            stageId: startStage?.id,
            stageName: startStage?.name,
            performedBy: userName,
            status: startStage?.status,
            timestamp: moment().format("YYYY-MM-DD HH:mm:ss"),
          },
        ],
        createdAt: moment().format("YYYY-MM-DD HH:mm:ss"),
        updatedAt: moment().format("YYYY-MM-DD HH:mm:ss"),
      };
    } catch (error) {
      logger.error("WorkflowService --> createInstanceData  --> error", error);
      throw error;
    }
  }

  async updateAssetWithWorkflowRequests(
    type: any,
    id: any,
    assetData: any,
    newWorkflowRequest: any
  ) {
    try {
      logger.info(
        "WorkflowService --> updateAssetWithWorkflowRequests --> id",
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
        "workflowService --> updateAssetWithWorkflowRequests --> error ::",
        error
      );
      throw error;
    }
  }

  //WorkflowInstanceServices

  async createWorkflowInstance(workflowInstanceData: any, userDetails: any) {
    try {
      logger.info(
        "WorkflowService --> createWorkflowInstance  --> data",
        workflowInstanceData
      );
      AuditLogger.logAction("createWorkflowInstance", { workflowInstanceData });
      const { assetId, workflowId, type } = workflowInstanceData;
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
      );
      const newInstance = await this.workflowRepository.addWorkflowInstance(
        instanceData,
        userDetails
      );
      const currentStagePossibleActions = startStage?.nextPossibleActions;
      const possibleActionsWithSpecifications = currentStagePossibleActions.map((action: any)=>{
      const stage = workflowDefinition.stages.find((stage: any)=>stage.name === action.stageName); 
      const staticSpecification = stage?.staticSpecification || [];
      const handlerSpecification =  stage?.handlerSpecification || [];
      return {  
          ...action,
          staticSpecification,
          handlerSpecification: handlerSpecification
        }
      })
      const newWorkflowRequest = {
        instanceId: newInstance.id,
        workflowId,
        workflowName: workflowDefinition?.name,
        currentStage: startStage?.name,
        currentStageId: startStage?.id,
        status: startStage?.status,
        possibleActions: possibleActionsWithSpecifications || [],
        currentAllowedRoles: startStage?.allowedRoles || [],
        currentAllowedUsers: startStage?.allowedUsers || [],
        requestedBy: userName,
        user_id: userId,
        requestedAt: moment().format("YYYY-MM-DD HH:mm:ss"),
      };
      await this.updateAssetWithWorkflowRequests(
        type,
        assetId,
        assetData,
        newWorkflowRequest
      );
      return {
        message: "Workflow Attached successfully",
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
  ) {
    try {
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
          status: lastEntryStage?.status,
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
          status: nextStage?.status || null,
        };
        history.push(currentStageEntry);
      }
      return history;
    } catch (error) {
      logger.error("WorkflowService --> updateHistory  --> error", error);
      throw error;
    }
  }

  async updateInstanceData(
    instanceData: any,
    stage: any,
    userName: any,
    currentAllowedRoles: any,
    currentAllowedUsers: any,
  ) {
    try {
      logger.info(
        "WorkflowService --> updateInstanceData  --> instanceData",
        instanceData
      );

      //instanceData[0].requestedData = (requestedData && Object.keys(requestedData)?.length > 0) ? requestedData : instanceData?.requestedData || {};
      instanceData[0].current_stage = stage.name;
      instanceData[0].current_stage_id = stage.id;
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
      const { workflowId, assetId, stageId, type } = data;
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
      const workflowDefinition = await this.getWorkflowDefinition(workflowId);
      const assetData = await this.getAsset(assetId, type);
      const nextStageDetails = await this.findStageById(
        workflowDefinition?.stages,
        stageId
      );
      const currentStageDetails = await this.findStageById(
        workflowDefinition?.stages,
        workflowInstanceData[0]?.current_stage_id
      );
      //await this.validateStageTransition(workflowInstanceData[0]?.possible_actions, stageId);
      const currentAllowedUsers = nextStageDetails?.allowedUsers || [];
      const currentAllowedRoles = nextStageDetails?.allowedRoles || [];
      let updatedInstanceData = await this.updateInstanceData(
        workflowInstanceData,
        nextStageDetails,
        userName,
        currentAllowedRoles,
        currentAllowedUsers,
      );
      const currentStagePossibleActions = nextStageDetails?.nextPossibleActions;
      const possibleActionsWithSpecifications = currentStagePossibleActions.map((action: any)=>{
        const stage = workflowDefinition.stages.find((stage: any)=>stage.name === action.stageName); 
        const staticSpecification = stage?.staticSpecification || [];
        const handlerSpecification =  stage?.handlerSpecification || [];
        return {  
          ...action,
           staticSpecification,
           handlerSpecification: handlerSpecification
        }
      })
      const newWorkflowRequest = {
        instanceId: instanceId,
        workflowId,
        nodeType: nextStageDetails?.nodeType || "",
        workflowName: workflowDefinition.name,
        currentStage: nextStageDetails.name,
        currentStageId: nextStageDetails.id,
        status: nextStageDetails.status,
        actionType: nextStageDetails?.actionType || "",
        possibleActions: possibleActionsWithSpecifications || [],
        current_allowed_roles: currentAllowedRoles,
        current_allowed_users: currentAllowedUsers,
        performedBy: userName,
        user_id: userId,
        lastModifiedAt: moment().format("YYYY-MM-DD HH:mm:ss"),
      };
      await this.workflowRepository.updateWorkflowInstanceById(
        instanceId,
        updatedInstanceData
      );
      await this.updateAssetWithWorkflowRequests(
        type,
        assetId,
        assetData,
        newWorkflowRequest
      );
      return {
        message: newWorkflowRequest?.nodeType === "end" ? "Workflow Completed for the Document Successfully" : "Workflow Instance Updated for the Document Successfully",
      };
    } catch (error) {
      logger.error(
        "WorkflowService --> updateWorkflowInstanceById  --> error",
        error
      );
      throw error;
    }
  }


}
