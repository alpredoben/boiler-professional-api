import { Request, Response, NextFunction } from "express";
import {
  validate,
  ValidationError as ClassValidationError,
} from "class-validator";
import { plainToClass } from "class-transformer";
import apiResponse from "@shared/utils/response.util";
import logger from "../utils/logger.util";

type ValidationSource = "body" | "query" | "params";

class ValidationMiddleware {
  private static instance: ValidationMiddleware;

  private constructor() {}

  public static getInstance(): ValidationMiddleware {
    if (!ValidationMiddleware.instance) {
      ValidationMiddleware.instance = new ValidationMiddleware();
    }
    return ValidationMiddleware.instance;
  }

  /**
   * Validate request using DTO class
   */
  public validateDto = (
    dtoClass: any,
    source: ValidationSource = "body",
    skipMissingProperties: boolean = false,
  ) => {
    return async (
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        // Get data from appropriate source
        const data = this.getDataFromSource(req, source);

        // Transform plain object to class instance
        const dtoInstance = plainToClass(dtoClass, data);

        // Validate
        const errors = await validate(dtoInstance, {
          skipMissingProperties,
          whitelist: true, // Strip properties not in DTO
          forbidNonWhitelisted: true, // Throw error if extra properties
        });

        if (errors.length > 0) {
          const formattedErrors = this.formatValidationErrors(errors);

          logger.warn("Validation failed", {
            path: req.path,
            errors: formattedErrors,
          });

          apiResponse.sendValidationError(
            res,
            "Validation failed",
            formattedErrors,
          );
          return;
        }

        // Attach validated data to request
        this.attachValidatedData(req, source, dtoInstance);

        next();
      } catch (error) {
        logger.error("Validation middleware error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        apiResponse.sendInternalError(res, "Validation error");
      }
    };
  };

  /**
   * Validate body
   */
  public validateBody = (
    dtoClass: any,
    skipMissingProperties: boolean = false,
  ) => {
    return this.validateDto(dtoClass, "body", skipMissingProperties);
  };

  /**
   * Validate query parameters
   */
  public validateQuery = (
    dtoClass: any,
    skipMissingProperties: boolean = false,
  ) => {
    return this.validateDto(dtoClass, "query", skipMissingProperties);
  };

  /**
   * Validate URL parameters
   */
  public validateParams = (
    dtoClass: any,
    skipMissingProperties: boolean = false,
  ) => {
    return this.validateDto(dtoClass, "params", skipMissingProperties);
  };

  /**
   * Validate multiple sources
   */
  public validateMultiple = (
    validations: Array<{
      dtoClass: any;
      source: ValidationSource;
      skipMissingProperties?: boolean;
    }>,
  ) => {
    return async (
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        const allErrors: Record<string, any> = {};

        for (const validation of validations) {
          const data = this.getDataFromSource(req, validation.source);
          const dtoInstance = plainToClass(validation.dtoClass, data);

          const errors = await validate(dtoInstance, {
            skipMissingProperties: validation.skipMissingProperties || false,
            whitelist: true,
            forbidNonWhitelisted: true,
          });

          if (errors.length > 0) {
            const formattedErrors = this.formatValidationErrors(errors);
            allErrors[validation.source] = formattedErrors;
          } else {
            this.attachValidatedData(req, validation.source, dtoInstance);
          }
        }

        if (Object.keys(allErrors).length > 0) {
          logger.warn("Multiple validation failed", {
            path: req.path,
            errors: allErrors,
          });

          apiResponse.sendValidationError(res, "Validation failed", allErrors);
          return;
        }

        next();
      } catch (error) {
        logger.error("Multiple validation middleware error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        apiResponse.sendInternalError(res, "Validation error");
      }
    };
  };

  /**
   * Custom validation function
   */
  public customValidation = (
    validationFn: (req: Request) => Promise<{ isValid: boolean; errors?: any }>,
  ) => {
    return async (
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        const result = await validationFn(req);

        if (!result.isValid) {
          logger.warn("Custom validation failed", {
            path: req.path,
            errors: result.errors,
          });

          apiResponse.sendValidationError(
            res,
            "Validation failed",
            result.errors,
          );
          return;
        }

        next();
      } catch (error) {
        logger.error("Custom validation error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        apiResponse.sendInternalError(res, "Validation error");
      }
    };
  };

  /**
   * Validate specific fields
   */
  public validateFields = (
    fields: Array<{
      name: string;
      source?: ValidationSource;
      required?: boolean;
      type?: "string" | "number" | "boolean" | "email" | "uuid" | "url";
      min?: number;
      max?: number;
      pattern?: RegExp;
      custom?: (value: any) => boolean;
      message?: string;
    }>,
  ) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      const errors: Record<string, string[]> = {};

      for (const field of fields) {
        const source = field.source || "body";
        const data = this.getDataFromSource(req, source);
        const value = data[field.name];

        const fieldErrors: string[] = [];

        // Required check
        if (
          field.required &&
          (value === undefined || value === null || value === "")
        ) {
          fieldErrors.push(field.message || `${field.name} is required`);
        }

        // Type validation
        if (value !== undefined && value !== null && field.type) {
          switch (field.type) {
            case "string":
              if (typeof value !== "string") {
                fieldErrors.push(`${field.name} must be a string`);
              }
              break;
            case "number":
              if (typeof value !== "number" && isNaN(Number(value))) {
                fieldErrors.push(`${field.name} must be a number`);
              }
              break;
            case "boolean":
              if (typeof value !== "boolean") {
                fieldErrors.push(`${field.name} must be a boolean`);
              }
              break;
            case "email":
              if (typeof value === "string" && !this.isValidEmail(value)) {
                fieldErrors.push(`${field.name} must be a valid email`);
              }
              break;
            case "uuid":
              if (typeof value === "string" && !this.isValidUUID(value)) {
                fieldErrors.push(`${field.name} must be a valid UUID`);
              }
              break;
            case "url":
              if (typeof value === "string" && !this.isValidURL(value)) {
                fieldErrors.push(`${field.name} must be a valid URL`);
              }
              break;
          }
        }

        // Min/Max validation
        if (value !== undefined && value !== null) {
          if (field.min !== undefined) {
            if (typeof value === "string" && value.length < field.min) {
              fieldErrors.push(
                `${field.name} must be at least ${field.min} characters`,
              );
            }
            if (typeof value === "number" && value < field.min) {
              fieldErrors.push(`${field.name} must be at least ${field.min}`);
            }
          }

          if (field.max !== undefined) {
            if (typeof value === "string" && value.length > field.max) {
              fieldErrors.push(
                `${field.name} must be at most ${field.max} characters`,
              );
            }
            if (typeof value === "number" && value > field.max) {
              fieldErrors.push(`${field.name} must be at most ${field.max}`);
            }
          }
        }

        // Pattern validation
        if (value && field.pattern && typeof value === "string") {
          if (!field.pattern.test(value)) {
            fieldErrors.push(
              field.message || `${field.name} has invalid format`,
            );
          }
        }

        // Custom validation
        if (value && field.custom) {
          try {
            if (!field.custom(value)) {
              fieldErrors.push(
                field.message || `${field.name} validation failed`,
              );
            }
          } catch (error) {
            fieldErrors.push(`${field.name} validation error`);
          }
        }

        if (fieldErrors.length > 0) {
          errors[field.name] = fieldErrors;
        }
      }

      if (Object.keys(errors).length > 0) {
        logger.warn("Field validation failed", {
          path: req.path,
          errors,
        });

        apiResponse.sendValidationError(res, "Validation failed", errors);
        return;
      }

      next();
    };
  };

  /**
   * Get data from request source
   */
  private getDataFromSource(req: Request, source: ValidationSource): any {
    switch (source) {
      case "body":
        return req.body;
      case "query":
        return req.query;
      case "params":
        return req.params;
      default:
        return {};
    }
  }

  /**
   * Attach validated data to request
   */
  private attachValidatedData(
    req: Request,
    source: ValidationSource,
    data: any,
  ): void {
    switch (source) {
      case "body":
        req.body = data;
        break;
      case "query":
        req.query = data;
        break;
      case "params":
        req.params = data;
        break;
    }
  }

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
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate UUID format
   */
  private isValidUUID(uuid: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Validate URL format
   */
  private isValidURL(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
const validationMiddleware = ValidationMiddleware.getInstance();

export default validationMiddleware;

// Export individual middleware functions
export const validateDto = validationMiddleware.validateDto;
export const validateBody = validationMiddleware.validateBody;
export const validateQuery = validationMiddleware.validateQuery;
export const validateParams = validationMiddleware.validateParams;
export const validateMultiple = validationMiddleware.validateMultiple;
export const customValidation = validationMiddleware.customValidation;
export const validateFields = validationMiddleware.validateFields;
