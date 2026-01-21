import { Request, Response, NextFunction } from "express";
import { ValidationError as ClassValidationError } from "class-validator";
import { QueryFailedError } from "typeorm";
import environment from "@config/environment";
import apiResponse from "@shared/utils/response.util";
import logger from "../utils/logger.util";

// Custom Error Classes
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = "Bad request") {
    super(message, 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden") {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Resource not found") {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = "Resource conflict") {
    super(message, 409);
  }
}

export class ValidationError extends AppError {
  public errors: any;

  constructor(message: string = "Validation failed", errors?: any) {
    super(message, 422);
    this.errors = errors;
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message: string = "Too many requests") {
    super(message, 429);
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = "Internal server error") {
    super(message, 500);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = "Service unavailable") {
    super(message, 503);
  }
}

class ErrorHandlerMiddleware {
  private static instance: ErrorHandlerMiddleware;

  private constructor() {}

  public static getInstance(): ErrorHandlerMiddleware {
    if (!ErrorHandlerMiddleware.instance) {
      ErrorHandlerMiddleware.instance = new ErrorHandlerMiddleware();
    }
    return ErrorHandlerMiddleware.instance;
  }

  /**
   * Global error handler
   */
  public handle = (
    error: Error | AppError,
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    let statusCode = 500;
    let message = "Internal server error";
    let errors: any = undefined;

    // Handle custom AppError
    if (error instanceof AppError) {
      statusCode = error.statusCode;
      message = error.message;

      if (error instanceof ValidationError) {
        errors = error.errors;
      }
    }
    // Handle class-validator validation errors
    else if (Array.isArray(error) && error[0] instanceof ClassValidationError) {
      statusCode = 422;
      message = "Validation failed";
      errors = this.formatValidationErrors(error as ClassValidationError[]);
    }
    // Handle TypeORM query errors
    else if (error instanceof QueryFailedError) {
      const result = this.handleDatabaseError(error);
      statusCode = result.statusCode;
      message = result.message;
      errors = result.errors;
    }
    // Handle JWT errors
    else if (error.name === "JsonWebTokenError") {
      statusCode = 401;
      message = "Invalid token";
    } else if (error.name === "TokenExpiredError") {
      statusCode = 401;
      message = "Token expired";
    }
    // Handle Multer errors (file upload)
    else if (error.name === "MulterError") {
      statusCode = 400;
      message = this.getMulterErrorMessage(error);
    }
    // Handle generic errors
    else {
      message = error.message || "Internal server error";
    }

    // Log error
    this.logError(error, req, statusCode);

    // Send error response
    const errorResponse = {
      message,
      errors,
      meta: {
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
      },
    };

    // Include stack trace in development
    if (environment.isDevelopment() && error.stack) {
      (errorResponse as any).stack = error.stack;
    }

    apiResponse.sendError(res, statusCode, message, errors, errorResponse.meta);
  };

  /**
   * 404 Not Found handler
   */
  public notFound = (req: Request, res: Response, next: NextFunction): void => {
    const error = new NotFoundError(
      `Route ${req.method} ${req.path} not found`,
    );
    this.handle(error, req, res, next);
  };

  /**
   * Async error wrapper
   */
  public asyncHandler = (
    fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
  ) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  };

  /**
   * Format class-validator errors
   */
  private formatValidationErrors(
    errors: ClassValidationError[],
  ): Record<string, string[]> {
    const formatted: Record<string, string[]> = {};

    errors.forEach((error) => {
      if (error.constraints) {
        formatted[error.property] = Object.values(error.constraints);
      }

      // Handle nested validation errors
      if (error.children && error.children.length > 0) {
        const childErrors = this.formatValidationErrors(error.children);
        Object.keys(childErrors).forEach((key) => {
          formatted[`${error.property}.${key}`] = childErrors[key];
        });
      }
    });

    return formatted;
  }

  /**
   * Handle database errors
   */
  private handleDatabaseError(error: QueryFailedError): {
    statusCode: number;
    message: string;
    errors?: any;
  } {
    const driverError = error.driverError as any;

    // PostgreSQL error codes
    switch (driverError.code) {
      case "23505": // Unique violation
        return {
          statusCode: 409,
          message: "Resource already exists",
          errors: { conflict: this.extractConflictField(driverError.detail) },
        };

      case "23503": // Foreign key violation
        return {
          statusCode: 400,
          message: "Referenced resource does not exist",
          errors: { foreignKey: "Invalid reference" },
        };

      case "23502": // Not null violation
        return {
          statusCode: 400,
          message: "Required field is missing",
          errors: { required: driverError.column },
        };

      case "22P02": // Invalid text representation
        return {
          statusCode: 400,
          message: "Invalid data format",
          errors: { format: "Invalid value provided" },
        };

      case "42P01": // Undefined table
        return {
          statusCode: 500,
          message: "Database configuration error",
        };

      default:
        logger.error("Unhandled database error", {
          code: driverError.code,
          message: driverError.message,
        });

        return {
          statusCode: 500,
          message: environment.isProduction()
            ? "Database error occurred"
            : driverError.message,
        };
    }
  }

  /**
   * Extract conflict field from PostgreSQL error detail
   */
  private extractConflictField(detail: string): string {
    if (!detail) return "Unknown field";

    const match = detail.match(/Key \(([^)]+)\)/);
    return match ? match[1] : "Unknown field";
  }

  /**
   * Get Multer error message
   */
  private getMulterErrorMessage(error: any): string {
    switch (error.code) {
      case "LIMIT_FILE_SIZE":
        return "File size exceeds the maximum allowed limit";
      case "LIMIT_FILE_COUNT":
        return "Too many files uploaded";
      case "LIMIT_UNEXPECTED_FILE":
        return "Unexpected field in file upload";
      default:
        return "File upload error";
    }
  }

  /**
   * Log error with appropriate level
   */
  private logError(
    error: Error | AppError,
    req: Request,
    statusCode: number,
  ): void {
    const logData = {
      message: error.message,
      statusCode,
      path: req.path,
      method: req.method,
      ip: req.ip,
      userId: req.user?.id,
      stack: error.stack,
    };

    if (statusCode >= 500) {
      logger.error("Server error", logData);
    } else if (statusCode >= 400) {
      logger.warn("Client error", logData);
    } else {
      logger.info("Error handled", logData);
    }
  }

  /**
   * Handle unhandled promise rejections
   */
  public handleUnhandledRejection = (
    reason: any,
    promise: Promise<any>,
  ): void => {
    logger.error("Unhandled Promise Rejection", {
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined,
    });

    // In production, might want to gracefully shutdown
    if (environment.isProduction()) {
      process.exit(1);
    }
  };

  /**
   * Handle uncaught exceptions
   */
  public handleUncaughtException = (error: Error): void => {
    logger.error("Uncaught Exception", {
      message: error.message,
      stack: error.stack,
    });

    // Always exit on uncaught exception
    process.exit(1);
  };

  /**
   * Validation error helper
   */
  public createValidationError(
    errors: Record<string, string | string[]>,
  ): ValidationError {
    const formattedErrors: Record<string, string[]> = {};

    Object.entries(errors).forEach(([key, value]) => {
      formattedErrors[key] = Array.isArray(value) ? value : [value];
    });

    return new ValidationError("Validation failed", formattedErrors);
  }

  /**
   * Check if error is operational
   */
  public isOperationalError(error: Error): boolean {
    if (error instanceof AppError) {
      return error.isOperational;
    }
    return false;
  }
}

// Export singleton instance
const errorHandler = ErrorHandlerMiddleware.getInstance();

export default errorHandler;

// Export error classes
export { errorHandler, AppError as BaseError };

// Export middleware functions
export const handleError = errorHandler.handle;
export const handleNotFound = errorHandler.notFound;
export const asyncHandler = errorHandler.asyncHandler;
export const handleUnhandledRejection = errorHandler.handleUnhandledRejection;
export const handleUncaughtException = errorHandler.handleUncaughtException;
