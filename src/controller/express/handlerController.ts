import logger from "../../utils/logger";
import { authMiddleware } from "../../middleware/authorization";
import { HandlerService } from "../../service/handlerService";

const handlerService = new HandlerService();

export const executeHandler = async (req: any, res: any) => {
  try {
    if (authMiddleware(req, res)) return;
    logger.info(
      "Express Controller --> executeHandler --> Request Body",
      req.body
    ); 

    const result = await handlerService.executeHandler(req.body);
    res.status(200).json(result);
  } catch (error: any) {
    logger.error("Express Controller --> executeHandler --> Error", error);
    res
      .status(error.status || 500)
      .json({ message: error.message || "Internal server error" });
  }
};

export const getAllHandlers = async (req: any, res: any) => {
  try {
    if (authMiddleware(req, res)) return;
    logger.info(
      "Express Controller --> getAllHandlers"
    ); 

    const result = await handlerService.getAllHandlers();
    res.status(200).json(result);
  } catch (error: any) {
    logger.error("Express Controller --> getAllHandlers --> Error", error);
    res
      .status(error.status || 500)
      .json({ message: error.message || "Internal server error" });
  }
};
