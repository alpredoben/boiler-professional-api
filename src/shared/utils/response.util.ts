import { Response } from "express";
import {
  In_ApiResponseMeta,
  In_ApiResponseStructure,
} from "src/interfaces/util.interface";

class ApiResponse {
  private static instance: ApiResponse;

  private constructor() {}

  public static getInstance(): ApiResponse {
    if (!ApiResponse.instance) {
      ApiResponse.instance = new ApiResponse();
    }
    return ApiResponse.instance;
  }

  /**
   * Create base response structure
   */
  private createBaseResponse<T>(
    success: boolean,
    message: string,
    data?: T,
    errors?: any,
    meta?: Partial<In_ApiResponseMeta>,
  ): In_ApiResponseStructure<T> {
    return {
      success,
      message,
      data,
      errors,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta,
      },
    };
  }

  /**
   * Success response
   */
  public success<T>(
    message: string,
    data?: T,
    meta?: Partial<In_ApiResponseMeta>,
  ): In_ApiResponseStructure<T> {
    return this.createBaseResponse(true, message, data, undefined, meta);
  }

  /**
   * Error response
   */
  public error(
    message: string,
    errors?: any,
    meta?: Partial<In_ApiResponseMeta>,
  ): In_ApiResponseStructure {
    return this.createBaseResponse(false, message, undefined, errors, meta);
  }

  /**
   * Paginated response
   */
  public paginated<T>(
    message: string,
    data: T[],
    page: number,
    limit: number,
    total: number,
    meta?: Partial<In_ApiResponseMeta>,
  ): In_ApiResponseStructure<T[]> {
    const totalPages = Math.ceil(total / limit);

    return this.createBaseResponse(true, message, data, undefined, {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      ...meta,
    });
  }

  /**
   * Created response (201)
   */
  public created<T>(
    message: string,
    data?: T,
    meta?: Partial<In_ApiResponseMeta>,
  ): In_ApiResponseStructure<T> {
    return this.createBaseResponse(true, message, data, undefined, {
      statusCode: 201,
      ...meta,
    });
  }

  /**
   * No content response (204)
   */
  public noContent(message: string = "No content"): In_ApiResponseStructure {
    return this.createBaseResponse(true, message, undefined, undefined, {
      statusCode: 204,
    });
  }

  /**
   * Bad request response (400)
   */
  public badRequest(
    message: string,
    errors?: any,
    meta?: Partial<In_ApiResponseMeta>,
  ): In_ApiResponseStructure {
    return this.createBaseResponse(false, message, undefined, errors, {
      statusCode: 400,
      ...meta,
    });
  }

  /**
   * Unauthorized response (401)
   */
  public unauthorized(
    message: string = "Unauthorized",
    errors?: any,
    meta?: Partial<In_ApiResponseMeta>,
  ): In_ApiResponseStructure {
    return this.createBaseResponse(false, message, undefined, errors, {
      statusCode: 401,
      ...meta,
    });
  }

  /**
   * Forbidden response (403)
   */
  public forbidden(
    message: string = "Forbidden",
    errors?: any,
    meta?: Partial<In_ApiResponseMeta>,
  ): In_ApiResponseStructure {
    return this.createBaseResponse(false, message, undefined, errors, {
      statusCode: 403,
      ...meta,
    });
  }

  /**
   * Not found response (404)
   */
  public notFound(
    message: string = "Resource not found",
    errors?: any,
    meta?: Partial<In_ApiResponseMeta>,
  ): In_ApiResponseStructure {
    return this.createBaseResponse(false, message, undefined, errors, {
      statusCode: 404,
      ...meta,
    });
  }

  /**
   * Conflict response (409)
   */
  public conflict(
    message: string,
    errors?: any,
    meta?: Partial<In_ApiResponseMeta>,
  ): In_ApiResponseStructure {
    return this.createBaseResponse(false, message, undefined, errors, {
      statusCode: 409,
      ...meta,
    });
  }

  /**
   * Unprocessable entity response (422)
   */
  public unprocessableEntity(
    message: string,
    errors?: any,
    meta?: Partial<In_ApiResponseMeta>,
  ): In_ApiResponseStructure {
    return this.createBaseResponse(false, message, undefined, errors, {
      statusCode: 422,
      ...meta,
    });
  }

  /**
   * Too many requests response (429)
   */
  public tooManyRequests(
    message: string = "Too many requests",
    retryAfter?: number,
    meta?: Partial<In_ApiResponseMeta>,
  ): In_ApiResponseStructure {
    return this.createBaseResponse(false, message, undefined, undefined, {
      statusCode: 429,
      retryAfter,
      ...meta,
    });
  }

  /**
   * Internal server error response (500)
   */
  public internalServerError(
    message: string = "Internal server error",
    errors?: any,
    meta?: Partial<In_ApiResponseMeta>,
  ): In_ApiResponseStructure {
    return this.createBaseResponse(false, message, undefined, errors, {
      statusCode: 500,
      ...meta,
    });
  }

  /**
   * Service unavailable response (503)
   */
  public serviceUnavailable(
    message: string = "Service unavailable",
    errors?: any,
    meta?: Partial<In_ApiResponseMeta>,
  ): In_ApiResponseStructure {
    return this.createBaseResponse(false, message, undefined, errors, {
      statusCode: 503,
      ...meta,
    });
  }

  /**
   * Send success response
   */
  public sendSuccess<T>(
    res: Response,
    statusCode: number,
    message: string,
    data?: T,
    meta?: Partial<In_ApiResponseMeta>,
  ): Response {
    const response = this.success(message, data, {
      statusCode,
      ...meta,
    });
    return res.status(statusCode).json(response);
  }

  /**
   * Send error response
   */
  public sendError(
    res: Response,
    statusCode: number,
    message: string,
    errors?: any,
    meta?: Partial<In_ApiResponseMeta>,
  ): Response {
    const response = this.error(message, errors, {
      statusCode,
      ...meta,
    });
    return res.status(statusCode).json(response);
  }

  /**
   * Send paginated response
   */
  public sendPaginated<T>(
    res: Response,
    message: string,
    data: T[],
    page: number,
    limit: number,
    total: number,
    meta?: Partial<In_ApiResponseMeta>,
  ): Response {
    const response = this.paginated(message, data, page, limit, total, meta);
    return res.status(200).json(response);
  }

  /**
   * Send created response (201)
   */
  public sendCreated<T>(
    res: Response,
    message: string,
    data?: T,
    meta?: Partial<In_ApiResponseMeta>,
  ): Response {
    const response = this.created(message, data, meta);
    return res.status(201).json(response);
  }

  /**
   * Send no content response (204)
   */
  public sendNoContent(res: Response, message?: string): Response {
    const response = this.noContent(message);
    return res.status(204).json(response);
  }

  /**
   * Send bad request response (400)
   */
  public sendBadRequest(
    res: Response,
    message: string,
    errors?: any,
    meta?: Partial<In_ApiResponseMeta>,
  ): Response {
    const response = this.badRequest(message, errors, meta);
    return res.status(400).json(response);
  }

  /**
   * Send unauthorized response (401)
   */
  public sendUnauthorized(
    res: Response,
    message?: string,
    errors?: any,
    meta?: Partial<In_ApiResponseMeta>,
  ): Response {
    const response = this.unauthorized(message, errors, meta);
    return res.status(401).json(response);
  }

  /**
   * Send forbidden response (403)
   */
  public sendForbidden(
    res: Response,
    message?: string,
    errors?: any,
    meta?: Partial<In_ApiResponseMeta>,
  ): Response {
    const response = this.forbidden(message, errors, meta);
    return res.status(403).json(response);
  }

  /**
   * Send not found response (404)
   */
  public sendNotFound(
    res: Response,
    message?: string,
    errors?: any,
    meta?: Partial<In_ApiResponseMeta>,
  ): Response {
    const response = this.notFound(message, errors, meta);
    return res.status(404).json(response);
  }

  /**
   * Send conflict response (409)
   */
  public sendConflict(
    res: Response,
    message: string,
    errors?: any,
    meta?: Partial<In_ApiResponseMeta>,
  ): Response {
    const response = this.conflict(message, errors, meta);
    return res.status(409).json(response);
  }

  /**
   * Send validation error response (422)
   */
  public sendValidationError(
    res: Response,
    message: string,
    errors?: any,
    meta?: Partial<In_ApiResponseMeta>,
  ): Response {
    const response = this.unprocessableEntity(message, errors, meta);
    return res.status(422).json(response);
  }

  /**
   * Send rate limit error response (429)
   */
  public sendRateLimit(
    res: Response,
    message?: string,
    retryAfter?: number,
    meta?: Partial<In_ApiResponseMeta>,
  ): Response {
    const response = this.tooManyRequests(message, retryAfter, meta);
    if (retryAfter) {
      res.setHeader("Retry-After", retryAfter.toString());
    }
    return res.status(429).json(response);
  }

  /**
   * Send internal server error response (500)
   */
  public sendInternalError(
    res: Response,
    message?: string,
    errors?: any,
    meta?: Partial<In_ApiResponseMeta>,
  ): Response {
    const response = this.internalServerError(message, errors, meta);
    return res.status(500).json(response);
  }
}

// Export singleton instance
export default ApiResponse.getInstance();
