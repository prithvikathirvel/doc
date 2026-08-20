import { randomUUID } from "crypto";
import { ErrorRequestHandler, RequestHandler } from "express";
import { AppError, DatabaseError } from "../utils/errors";
import logger from "../utils/logger";
import { metrics } from "../utils/metrics";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/** Assigns a correlation id so a failed response can be found in the logs. */
export const requestContext: RequestHandler = (req, res, next) => {
  req.requestId = req.header("x-request-id") || randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
};

function context(req: Parameters<ErrorRequestHandler>[1] extends never ? never : any) {
  return {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl || req.path,
    tenantId: req.auth?.tenantId,
    userId: req.auth?.userId,
    roles: req.auth?.roles,
  };
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const base = context(req);

  if (err instanceof AppError) {
    const payload = {
      ...base,
      code: err.code,
      status: err.statusCode,
      message: err.message,
      ...(err instanceof DatabaseError ? err.details : {}),
    };

    if (err.statusCode >= 500) {
      metrics.inc("processing_failures");
      logger.error("request_failed", { ...payload, stack: err.stack });
    } else {
      // 4xx are expected outcomes, but they are logged so misconfigured clients are visible.
      logger.warn("request_rejected", payload);
    }

    res.status(err.statusCode).json({
      status: "error",
      code: err.code,
      // Internal failures never expose driver or vendor detail to the caller.
      message: err.statusCode >= 500 ? "The request could not be completed" : err.message,
      requestId: req.requestId,
    });
    return;
  }

  const error = err as Error;
  metrics.inc("processing_failures");
  logger.error("unexpected_error", {
    ...base,
    name: error.name,
    message: error.message,
    stack: error.stack,
  });

  res.status(500).json({
    status: "error",
    code: "INTERNAL_ERROR",
    message: "Internal server error",
    requestId: req.requestId,
  });
};
