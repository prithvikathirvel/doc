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
    requestedData: any
  ) {
    try {
      logger.info("WorkflowService --> createInstanceData --> stages", assetId);
      console.log("requestedData inside func is", requestedData);
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
        updatedAt: moment().format("YYYY-MM-DD HH:mm:ss"),
        requestedData,
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
      console.log("start Stage is xxx", startStage);
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
      console.log("instance Data is a", instanceData);
      const newInstance = await this.workflowRepository.addWorkflowInstance(
        instanceData,
        userDetails
      );
      console.log("new Instnace is buddy", newInstance);
      const newWorkflowRequest = {
        instanceId: newInstance.id,
        workflowId,
        workflowName: workflowDefinition?.name,
        currentStage: startStage?.name,
        currentStageId: startStage?.id,
        status: startStage?.status,
        possibleActions: startStage?.nextPossibleActions || [],
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
      if (
        newInstance?.currentStage === "Start" &&
        startStage?.nodeType === "start" &&
        newInstance?.currentAllowedRoles.length === 0 &&
        newInstance?.currentAllowedUsers.length === 0
      ) {
        console.log("xxxxx");
        const docInfo = {};
        const data = {
          workflowId: workflowId,
          assetId: assetId,
          stageId: startStage?.nextPossibleActions[0]?.id,
          type: type,
          inputData: {},
        };
        console.log("inside me");
        await this.updateWorkflowInstanceById(
          newInstance?.id,
          data,
          userDetails,
          docInfo,
          false
        );
      }
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
      console.log("data around me", data);
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
      const workflowDefinition = await this.getWorkflowDefinition(workflowId);
      const assetData = await this.getAsset(assetId, type);
      const nextStageDetails = await this.findStageById(
        workflowDefinition?.stages,
        stageId
      );
      console.log("workflowInstanceDatxsa is", workflowInstanceData);
      const currentStageDetails = await this.findStageById(
        workflowDefinition?.stages,
        workflowInstanceData[0]?.current_stage_id
      );
      console.log("vais accs", nextStageDetails);
      console.log("currentStageDetails", currentStageDetails);
      //await this.validateStageTransition(workflowInstanceData[0]?.possible_actions, stageId);
      // const { currentAllowedRoles, currentAllowedUsers } = await this.getAllowedRolesAndUsers(stage?.nextPossibleActions, workflowDefinition?.stages);
      const currentAllowedUsers = nextStageDetails?.allowedUsers || [];
      const currentAllowedRoles = nextStageDetails?.allowedRoles || [];
      let updatedInstanceData = await this.updateInstanceData(
        workflowInstanceData,
        nextStageDetails,
        userName,
        currentAllowedRoles,
        currentAllowedUsers,
        inputData
      );
      if (
        currentStageDetails.actionType === "static" &&
        Array.isArray(currentStageDetails.staticSpecification) &&
        currentStageDetails.staticSpecification.length > 0 &&
        inputData?.currentStageInput
      ) {
        await this.updateAssetWithStaticInput(
          type,
          assetId,
          assetData,
          currentStageDetails.staticSpecification,
          inputData.currentStageInput
        );
      }
      const newWorkflowRequest = {
        instanceId: instanceId,
        workflowId,
        workflowName: workflowDefinition.name,
        currentStage: nextStageDetails.name,
        currentStageId: nextStageDetails.id,
        status: nextStageDetails.status,
        actionType: nextStageDetails?.actionType,
        [nextStageDetails?.actionType === "static"
          ? "staticSpecification"
          : "handlerSpecification"]:
          nextStageDetails?.actionType === "static"
            ? nextStageDetails?.staticSpecification
            : nextStageDetails?.handlerSpecification,
        possibleActions: nextStageDetails?.isEnd
          ? null
          : nextStageDetails.nextPossibleActions,
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
      await this.updateAssetWithWorkflowRequests(
        type,
        assetId,
        assetData,
        newWorkflowRequest
      );
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
      };
    } catch (error) {
      logger.error(
        "WorkflowService --> updateWorkflowInstanceById  --> error",
        error
      );
      throw error;
    }
  }

  getNested(obj: any, path: string): any {
    if (!path || typeof path !== "string") return undefined;
    return path.split(".").reduce((o, key) => (o ? o[key] : undefined), obj);
  }

  setNested(obj: any, path: string, value: any): void {
    if (!path || typeof path !== "string") return;
    const keys = path.split(".");
    const lastKey = keys.pop();
    const target = keys.reduce((o, key) => {
      if (!o[key]) o[key] = {};
      return o[key];
    }, obj);
    if (lastKey) target[lastKey] = value;
  }

  isEqual(val1: any, val2: any): boolean {
    return JSON.stringify(val1) === JSON.stringify(val2);
  }

  isEmpty(obj: Record<string, any>): boolean {
    return Object.keys(obj).length === 0;
  }

 async updateAssetWithStaticInput(
  assetType: string,
  assetId: string,
  assetData: any,
  staticSpecification: any[],
  currentStageInput: any
) {
  if (!currentStageInput || !staticSpecification?.length) return;

  console.log("assetData is", assetData);
  console.log("staticSpecification:", staticSpecification);
  console.log("currentStageInput", currentStageInput);

  const updatedFields: Record<string, any> = {};
  const updatedColumns: string[] = [];

  for (const spec of staticSpecification) {
    const fieldname = spec.fieldname;
    const operators: string[] = spec.operators || [];
    const stageInput = currentStageInput[fieldname];
    const currentValue = this.getNested(assetData[0], fieldname);

    if (
      (operators.includes("add") || operators.includes("remove")) &&
      stageInput &&
      typeof stageInput === "object" &&
      (stageInput.add || stageInput.remove)
    ) {
      const result: Record<string, any> = {};
      if (Array.isArray(stageInput.add)) result.add = [...stageInput.add];
      if (Array.isArray(stageInput.remove)) result.remove = [...stageInput.remove];

      if (!this.isEqual(result, currentValue)) {
        this.setNested(updatedFields, fieldname, result);
        updatedColumns.push(fieldname);
      }
      continue;
    }

    if (
      operators.includes("copyFrom") &&
      Array.isArray(stageInput?.copyFrom) &&
      operators.includes("copyTo") &&
      Array.isArray(stageInput?.copyTo)
    ) {
      for (const copyFromField of stageInput.copyFrom) {
        const sourceValue = this.getNested(assetData[0], copyFromField);
        if (sourceValue && typeof sourceValue === "object") {
          for (const copyToField of stageInput.copyTo) {
            const [topLevelKey, nestedKeyRaw] = copyToField.split(".");
            const originalJson = JSON.parse(assetData[0][topLevelKey] || "{}");
            const nestedKey = Object.keys(originalJson).find(
              (key) => key.toLowerCase() === nestedKeyRaw.toLowerCase()
            ) || nestedKeyRaw;

            const currentArray: string[] = Array.isArray(originalJson[nestedKey])
              ? originalJson[nestedKey]
              : [];

            const updatedSet = new Set(currentArray);

            if (Array.isArray(sourceValue.add)) {
              for (const tag of sourceValue.add) {
                updatedSet.add(tag);
              }
            }

            if (Array.isArray(sourceValue.remove)) {
              for (const tag of sourceValue.remove) {
                updatedSet.delete(tag);
              }
            }

            const updatedArray = Array.from(updatedSet);

            if (!this.isEqual(updatedArray, currentArray)) {
              if (!updatedFields[topLevelKey]) {
                updatedFields[topLevelKey] = { ...originalJson };
              }

              updatedFields[topLevelKey][nestedKey] = updatedArray;

              if (!updatedColumns.includes(topLevelKey)) {
                updatedColumns.push(topLevelKey);
              }
            }
          }
        }
      }
      continue;
    }

    const newValue = stageInput?.value ?? stageInput;
    if (!this.isEqual(newValue, currentValue)) {
      this.setNested(updatedFields, fieldname, newValue);
      updatedColumns.push(fieldname);
    }
  }

  console.log("updatedFields are", updatedFields);
  console.log("updatedColumns ", updatedColumns);

  if (!this.isEmpty(updatedFields)) {
    await this.workflowRepository.updateAssetMetadata(
      assetType,
      assetId,
      updatedFields,
      updatedColumns
    );
  }
}
}
