export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
    public readonly isOperational = true
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(404, message, "NOT_FOUND");
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request") {
    super(400, message, "BAD_REQUEST");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, message, "FORBIDDEN");
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(409, message, "CONFLICT");
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed") {
    super(422, message, "VALIDATION_ERROR");
  }
}

export class StorageError extends AppError {
  constructor(message = "Storage operation failed", code = "STORAGE_ERROR", statusCode = 502) {
    super(statusCode, message, code);
  }
}

export class StorageNotFoundError extends StorageError {
  constructor(message = "Storage object not found") {
    super(message, "STORAGE_NOT_FOUND", 404);
  }
}

export class StoragePermissionError extends StorageError {
  constructor(message = "Storage permission denied") {
    super(message, "STORAGE_PERMISSION", 403);
  }
}

export class StorageUploadError extends StorageError {
  constructor(message = "Storage upload failed") {
    super(message, "STORAGE_UPLOAD", 502);
  }
}

export class StorageDownloadError extends StorageError {
  constructor(message = "Storage download failed") {
    super(message, "STORAGE_DOWNLOAD", 502);
  }
}

export class StorageDeleteError extends StorageError {
  constructor(message = "Storage delete failed") {
    super(message, "STORAGE_DELETE", 502);
  }
}

export class StorageTimeoutError extends StorageError {
  constructor(message = "Storage operation timed out") {
    super(message, "STORAGE_TIMEOUT", 504);
  }
}

export class StorageConfigurationError extends StorageError {
  constructor(message = "Storage is not configured correctly") {
    super(message, "STORAGE_CONFIGURATION", 500);
  }
}

export class StorageCapabilityError extends StorageError {
  constructor(message = "Storage provider does not support this capability") {
    super(message, "STORAGE_CAPABILITY", 501);
  }
}
