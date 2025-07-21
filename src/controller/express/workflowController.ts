import logger from "../../utils/logger";
import { authMiddleware } from "../../middleware/authorization";
import { WorkflowService } from "../../service/workflowService";
import { updateWorkflowInstanceSchema } from "../../validator/createWorkflowSchema";

const workflowService = new WorkflowService();

export const createWorkflow = async (req: any, res: any) => {
  try {
    if (authMiddleware(req, res)) return;
    const user = { userId: req.userId, userName: req.userName };
    logger.info(
      "Express Controller --> createWorkflow --> Request Body",
      req.body
    ); 
    const result = await workflowService.createWorkflow(req.body, user);
    res.status(201).json(result);
  } catch (error: any) {
    logger.error("Express Controller --> createWorkflow --> Error", error);
    res
      .status(error.status || 500)
      .json({ message: error.message || "Internal server error" });
  }
};

export const getAllWorkflows = async (req: any, res: any) => {
  try {
    if (authMiddleware(req, res)) return;
    logger.info("Express Controller --> getAllWorkflows --> Request Body");
    const result = await workflowService.getAllWorkflows();
    res.status(201).json(result);
  } catch (error: any) {
    logger.error("Express Controller --> getAllWorkflows --> Error", error);
    res
      .status(error.status || 500)
      .json({ message: error.message || "Internal server error" });
  }
};

export const getWorkflowById = async (req: any, res: any) => {
  try {
    if (authMiddleware(req, res)) return;
    logger.info(
      "Express Controller --> getWorkflowById --> Request params",
      req.params.workflowId
    );
    const workflowId = req.params.workflowId;
    const result = await workflowService.getWorkflowById(workflowId);
    res.status(201).json(result);
  } catch (error: any) {
    logger.error("Express Controller --> getWorkflowById --> Error", error);
    res
      .status(error.status || 500)
      .json({ message: error.message || "Internal server error" });
  }
};

export const updateWorkflowById = async (req: any, res: any) => {
  try {
    if (authMiddleware(req, res)) return;
    const user = { userId: req.userId, userName: req.userName };
    logger.info(
      "Express Controller --> updateWorkflowById --> Request Body",
      req.body
    );
    const workflowId = req.params.workflowId;
    const result = await workflowService.updateWorkflowById(
      workflowId,
      req.body,
      user
    );
    res.status(201).json(result);
  } catch (error: any) {
    logger.error("Express Controller --> updateWorkflowById --> Error", error);
    res
      .status(error.status || 500)
      .json({ message: error.message || "Internal server error" });
  }
};

export const activateWorkflow = async (req: any, res: any) => {
  try {
    if (authMiddleware(req, res)) return;
    logger.info(
      "Express Controller --> activateWorkflow --> Request params",
      req.params.workflowId
    );
    const workflowId = req.params.workflowId;
    const result = await workflowService.activateWorkflow(workflowId);
    res.status(201).json(result);
  } catch (error: any) {
    logger.error("Express Controller --> activateWorkflow --> Error", error);
    res
      .status(error.status || 500)
      .json({ message: error.message || "Internal server error" });
  }
};

export const createStage = async (req: any, res: any) => {
  try {
    if (authMiddleware(req, res)) return;
    const user = { userId: req.userId, userName: req.userName };
    logger.info(
      "Express Controller --> createStage --> Request Body",
      req.body
    );
    const result = await workflowService.createStage(req.body, user);
    res.status(201).json(result);
  } catch (error: any) {
    logger.error("Express Controller --> createStage --> Error", error);
    res
      .status(error.status || 500)
      .json({ message: error.message || "Internal server error" });
  }
};

export const getAllStages = async (req: any, res: any) => {
  try {
    if (authMiddleware(req, res)) return;
    logger.info("Express Controller --> getAllStages --> Request Body");
    const result = await workflowService.getAllStages();
    res.status(201).json(result);
  } catch (error: any) {
    logger.error("Express Controller --> getAllStages --> Error", error);
    res
      .status(error.status || 500)
      .json({ message: error.message || "Internal server error" });
  }
};

export const getStageById = async (req: any, res: any) => {
  try {
    if (authMiddleware(req, res)) return;
    logger.info(
      "Express Controller --> getStageById --> Request Body",
      req.params.stageId
    );
    const stageId = req.params.stageId;
    const result = await workflowService.getStageById(stageId);
    res.status(201).json(result);
  } catch (error: any) {
    logger.error("Express Controller --> updateStageById --> Error", error);
    res
      .status(error.status || 500)
      .json({ message: error.message || "Internal server error" });
  }
};

export const updateStageById = async (req: any, res: any) => {
  try {
    if (authMiddleware(req, res)) return;
    const user = { userId: req.userId, userName: req.userName };
    logger.info(
      "Express Controller --> updateStageById --> Request Body",
      req.body
    );
    const stageId = req.params.stageId;
    const result = await workflowService.updateStageById(
      stageId,
      req.body,
      user
    );
    res.status(201).json(result);
  } catch (error: any) {
    logger.error("Express Controller --> updateStageById --> Error", error);
    res
      .status(error.status || 500)
      .json({ message: error.message || "Internal server error" });
  }
};

export const activateStage = async (req: any, res: any) => {
  try {
    if (authMiddleware(req, res)) return;
    logger.info(
      "Express Controller --> activateStage --> Request params",
      req.params.stageId
    );
    const stageId = req.params.stageId;
    const result = await workflowService.activateStage(stageId);
    res.status(201).json(result);
  } catch (error: any) {
    logger.error("Express Controller --> activateStage --> Error", error);
    res
      .status(error.status || 500)
      .json({ message: error.message || "Internal server error" });
  }
};

export const deleteStage = async (req: any, res: any) => {
  try {
    if (authMiddleware(req, res)) return;
    logger.info(
      "Express Controller --> deleteStage --> Request params",
      req.params.stageId
    );
    const stageId = req.params.stageId;
    const result = await workflowService.deleteStage(stageId);
    res.status(201).json(result);
  } catch (error: any) {
    logger.error("Express Controller --> deleteStage --> Error", error);
    res
      .status(error.status || 500)
      .json({ message: error.message || "Internal server error" });
  }
};

export const createWorkflowInstance = async (req: any, res: any) => {
  try {
    if (authMiddleware(req, res)) return;
    const user = { userId: req.userId, userName: req.userName };
    logger.info(
      "Express Controller --> createWorkflowInstance --> Request Body",
      req.body
    );
    const result = await workflowService.createWorkflowInstance(req.body, user);
    res.status(201).json(result);
  } catch (error: any) {
    logger.error(
      "Express Controller --> createWorkflowInstance --> Error",
      error
    );
    res
      .status(error.status || 500)
      .json({ message: error.message || "Internal server error" });
  }
};

export const getAllWorkflowInstances = async (req: any, res: any) => {
  try {
    if (authMiddleware(req, res)) return;
    const userId = req.params.userId;
    logger.info(
      "Express Controller --> getAllWorkflowInstances --> Request Body",
      req.body
    );
    const result = await workflowService.getAllWorkflowInstances(
      req.body,
      userId
    );
    res.status(201).json(result);
  } catch (error: any) {
    logger.error(
      "Express Controller --> getAllWorkflowInstances --> Error",
      error
    );
    res
      .status(error.status || 500)
      .json({ message: error.message || "Internal server error" });
  }
};

export const updateWorkflowInstanceById = async (req: any, res: any) => {
  try {
    // ✅ Check authentication
    if (authMiddleware(req, res)) return;

    let inputData: any = {};

    // ✅ Parse inputData from string (if sent via formData)
    if (req.body.inputData) {
      if (typeof req.body.inputData === 'string') {
        try {
          inputData = JSON.parse(req.body.inputData);
        } catch (err) {
          return res.status(400).json({ message: "Invalid inputData JSON format" });
        }
      } else {
        inputData = req.body.inputData;
      }
    }

    // ✅ If file is uploaded, attach it to nextStageHandlerInput
    if (req.file) {
      if (!inputData.nextStageHandlerInput)
        inputData.nextStageHandlerInput = {};
      inputData.nextStageHandlerInput.document = req.file;
    }

    // ✅ Construct payload for validation and service
    const payload = {
      workflowId: req.body.workflowId,
      assetId: req.body.assetId,
      type: req.body.type,
      stageId: req.body.stageId,
      inputData,
    };

    // ✅ Validate payload
    const { error } = updateWorkflowInstanceSchema.validate(payload);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    // ✅ Prepare document info if a file was uploaded
    let documentInfo: any = null;
    let isDocUploaded: boolean = false;
    if (req.file) {
      documentInfo = {
        directory: req.body.directory,
        userName: req.body.userName,
        fileInfo: req.file,
      };
      isDocUploaded = true;
    }

    // ✅ Call service
    const result = await workflowService.updateWorkflowInstanceById(
      req.params.workflowInstanceId,
      payload,
      { userId: req.userId, userName: req.userName },
      documentInfo,
      isDocUploaded
    );

    // ✅ Return response
    res.status(201).json(result);
  } catch (error: any) {
    logger.error("Express Controller --> updateWorkflowInstanceById --> Error", error);
    res
      .status(error.status || 500)
      .json({ message: error.message || "Internal server error" });
  }
};


