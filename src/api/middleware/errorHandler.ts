import { ErrorRequestHandler } from "express";
import { AppError } from "../../domain/exceptions";
import logger from "../../infrastructure/observability/logger";
import { metrics } from "../../infrastructure/observability/metrics";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      metrics.inc("processing_failures");
      logger.error("request_failed", {
        code: err.code,
        message: err.message,
        path: req.path,
        tenantId: req.auth?.tenantId,
      });
    }
    res.status(err.statusCode).json({
      status: "error",
      code: err.code,
      message: err.message,
    });
    return;
  }

  metrics.inc("processing_failures");
  logger.error("unexpected_error", { message: (err as Error).message, path: req.path });
  res.status(500).json({
    status: "error",
    code: "INTERNAL_ERROR",
    message: "Internal server error",
  });
};
