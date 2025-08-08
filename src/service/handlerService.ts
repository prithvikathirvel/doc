import { AuditLogger } from "../utils/audit";
import logger from "../utils/logger";
import createHttpError from "http-errors";
import { StatusCodes } from "http-status-codes";
import { HandlerRepository as MYSQLHandlerRepository } from "../dao/mysql/handlerDao";
import Handlers from "../config/handlerFieldsConfig";

export class HandlerService {
private handlerRepository: MYSQLHandlerRepository;

  constructor() {
    this.handlerRepository = new MYSQLHandlerRepository();
  }

  async executeHandler(inputParams: any) {
  try {
    logger.info("handlerService --> executeHandler --> data", inputParams);
    AuditLogger.logAction("executeHandler", { inputParams });
    
    const { handlerFunctionName, inputParams: params } = inputParams;

    // Map of handler names to repository methods
    const handlerMap: Record<string, Function> = {
      updateStatus: this.handlerRepository.updateStatus.bind(this.handlerRepository),
      sendEmail: this.handlerRepository.sendEmail.bind(this.handlerRepository),
      spellCheck: this.handlerRepository.spellCheck.bind(this.handlerRepository)
    };

    const handlerFunction = handlerMap[handlerFunctionName];
    if (!handlerFunction) {
      throw createHttpError(StatusCodes.BAD_REQUEST, `Unknown handler: ${handlerFunctionName}`);
    }
    const result = await handlerFunction(params);
    return {
      code: 0,
      message: result?.message,
    };
  } catch (error) {
    logger.error("handlerService --> executeHandler --> error", error);
    throw error;
  }
}

async getAllHandlers() {
  try {
    logger.info("handlerService --> getAllHandlers");
    return Handlers;
  } catch (error) {
    logger.error("handlerService --> executeHandler --> error", error);
    throw error;
  }
}
}