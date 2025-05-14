interface SQLError {
  code?: string;
  sqlMessage?: string;
  sqlState?: string;
}

export class AppError extends Error {
  public errorCode?: string;
  public sqlMessage?: string;
  public sqlState?: string;

  constructor(
    public statusCode: number,
    message: string,
    error?: any,
    public isOperational = true
  ) {
    super(message);
    if (error && this.isSQLError(error)) {
      this.errorCode = error.code;
      this.sqlMessage = error.sqlMessage;
      this.sqlState = error.sqlState;
    }
    Object.setPrototypeOf(this, AppError.prototype);
  }

  private isSQLError(error: any): error is SQLError {
    return 'code' in error || 'sqlMessage' in error || 'sqlState' in error;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, error?: any) {
    super(404, message, error);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(400, message);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, error?: any) {
    super(500, message, error);
  }
} 