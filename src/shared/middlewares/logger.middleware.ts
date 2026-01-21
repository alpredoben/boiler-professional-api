import { Request, Response, NextFunction } from "express";
import morgan from "morgan";
import logger from "../utils/logger.util";
import helpersUtil from "../utils/helpers.util";

class LoggerMiddleware {
  private static instance: LoggerMiddleware;

  private constructor() {}

  public static getInstance(): LoggerMiddleware {
    if (!LoggerMiddleware.instance) {
      LoggerMiddleware.instance = new LoggerMiddleware();
    }
    return LoggerMiddleware.instance;
  }

  /**
   * Morgan HTTP logger
   */
  public morgan = () => {
    return morgan(
      ":method :url :status :res[content-length] - :response-time ms",
      {
        stream: logger.stream,
        skip: (req: Request) => {
          // Skip logging for health check and metrics endpoints
          return req.path === "/health" || req.path === "/metrics";
        },
      },
    );
  };

  /**
   * Custom request logger
   */
  public logRequest = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const startTime = Date.now();

    // Log request
    logger.http("Incoming request", {
      method: req.method,
      url: req.url,
      path: req.path,
      ip: helpersUtil.getClientIp(req),
      userAgent: helpersUtil.getUserAgent(req),
      requestId: (req as any).id,
      userId: req.user?.id,
    });

    // Log response
    res.on("finish", () => {
      const duration = Date.now() - startTime;
      const logData = {
        method: req.method,
        url: req.url,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        contentLength: res.get("content-length"),
        ip: helpersUtil.getClientIp(req),
        requestId: (req as any).id,
        userId: req.user?.id,
      };

      if (res.statusCode >= 500) {
        logger.error("Request completed with server error", logData);
      } else if (res.statusCode >= 400) {
        logger.warn("Request completed with client error", logData);
      } else {
        logger.http("Request completed successfully", logData);
      }
    });

    next();
  };

  /**
   * Log slow requests (performance monitoring)
   */
  public logSlowRequests = (thresholdMs: number = 1000) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      const startTime = Date.now();

      res.on("finish", () => {
        const duration = Date.now() - startTime;

        if (duration > thresholdMs) {
          logger.warn("Slow request detected", {
            method: req.method,
            url: req.url,
            path: req.path,
            duration: `${duration}ms`,
            threshold: `${thresholdMs}ms`,
            statusCode: res.statusCode,
            ip: helpersUtil.getClientIp(req),
            userId: req.user?.id,
          });
        }
      });

      next();
    };
  };

  /**
   * Log authentication attempts
   */
  public logAuthAttempts = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const originalSend = res.send;

    res.send = function (data: any): Response {
      if (req.path.includes("/auth/login") || req.path.includes("/login")) {
        const statusCode = res.statusCode;
        const email = req.body?.email || req.body?.username;

        if (statusCode === 200 || statusCode === 201) {
          logger.info("Successful login attempt", {
            email,
            ip: helpersUtil.getClientIp(req),
            userAgent: helpersUtil.getUserAgent(req),
          });
        } else {
          logger.warn("Failed login attempt", {
            email,
            statusCode,
            ip: helpersUtil.getClientIp(req),
            userAgent: helpersUtil.getUserAgent(req),
          });
        }
      }

      return originalSend.call(this, data);
    };

    next();
  };

  /**
   * Log sensitive operations (CRUD on critical resources)
   */
  public logSensitiveOperations = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const sensitiveEndpoints = [
      "/users",
      "/roles",
      "/permissions",
      "/admin",
      "/settings",
    ];

    const isSensitive = sensitiveEndpoints.some((endpoint) =>
      req.path.includes(endpoint),
    );

    if (
      isSensitive &&
      ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
    ) {
      res.on("finish", () => {
        logger.info("Sensitive operation performed", {
          operation: req.method,
          resource: req.path,
          userId: req.user?.id,
          userEmail: req.user?.email,
          statusCode: res.statusCode,
          ip: helpersUtil.getClientIp(req),
          timestamp: new Date().toISOString(),
        });
      });
    }

    next();
  };

  /**
   * Log errors
   */
  public logErrors = (
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    logger.error("Error occurred", {
      error: error.message,
      stack: error.stack,
      method: req.method,
      url: req.url,
      path: req.path,
      body: req.body,
      query: req.query,
      params: req.params,
      ip: helpersUtil.getClientIp(req),
      userId: req.user?.id,
      requestId: (req as any).id,
    });

    next(error);
  };

  /**
   * Log database queries (for debugging)
   */
  public logDatabaseQueries = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    if (process.env.LOG_DB_QUERIES === "true") {
      const startTime = Date.now();

      res.on("finish", () => {
        const duration = Date.now() - startTime;

        logger.debug("Database operation completed", {
          method: req.method,
          path: req.path,
          duration: `${duration}ms`,
          userId: req.user?.id,
        });
      });
    }

    next();
  };

  /**
   * Log API usage statistics
   */
  public logApiUsage = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    res.on("finish", () => {
      logger.info("API usage", {
        endpoint: req.path,
        method: req.method,
        statusCode: res.statusCode,
        userId: req.user?.id,
        timestamp: new Date().toISOString(),
      });
    });

    next();
  };

  /**
   * Log file uploads
   */
  public logFileUploads = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    console.log("Request", { req });

    if ((req as any)?.files) {
      const files = Array.isArray((req as any).files)
        ? (req as any).files
        : [(req as any).files];

      logger.info("File upload", {
        fileCount: files.length,
        files: files.map((file: any) => ({
          filename: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
        })),
        userId: req.user?.id,
        ip: helpersUtil.getClientIp(req),
      });
    }

    next();
  };

  /**
   * Log cache hits/misses
   */
  public logCacheActivity = (
    cacheHit: boolean,
    key: string,
    req: Request,
  ): void => {
    logger.debug(cacheHit ? "Cache hit" : "Cache miss", {
      key,
      path: req.path,
      method: req.method,
      userId: req.user?.id,
    });
  };

  /**
   * Structured logging for specific events
   */
  public logEvent = (eventType: string, eventData: any, req: Request): void => {
    logger.info("Event logged", {
      eventType,
      eventData,
      userId: req.user?.id,
      ip: helpersUtil.getClientIp(req),
      timestamp: new Date().toISOString(),
    });
  };

  /**
   * Security event logging
   */
  public logSecurityEvent = (
    eventType:
      | "suspicious_activity"
      | "rate_limit_exceeded"
      | "invalid_token"
      | "unauthorized_access",
    details: any,
    req: Request,
  ): void => {
    logger.warn("Security event", {
      eventType,
      details,
      ip: helpersUtil.getClientIp(req),
      userAgent: helpersUtil.getUserAgent(req),
      path: req.path,
      method: req.method,
      userId: req.user?.id,
      timestamp: new Date().toISOString(),
    });
  };

  /**
   * Audit log for compliance
   */
  public auditLog = (
    action: string,
    resource: string,
    details: any,
    req: Request,
  ): void => {
    logger.info("Audit log", {
      action,
      resource,
      details,
      userId: req.user?.id,
      userEmail: req.user?.email,
      ip: helpersUtil.getClientIp(req),
      timestamp: new Date().toISOString(),
    });
  };
}

// Export singleton instance
const loggerMiddleware = LoggerMiddleware.getInstance();

export default loggerMiddleware;

// Export individual middleware functions
export const morganLogger = loggerMiddleware.morgan;
export const logRequest = loggerMiddleware.logRequest;
export const logSlowRequests = loggerMiddleware.logSlowRequests;
export const logAuthAttempts = loggerMiddleware.logAuthAttempts;
export const logSensitiveOperations = loggerMiddleware.logSensitiveOperations;
export const logErrors = loggerMiddleware.logErrors;
export const logDatabaseQueries = loggerMiddleware.logDatabaseQueries;
export const logApiUsage = loggerMiddleware.logApiUsage;
export const logFileUploads = loggerMiddleware.logFileUploads;
export const logCacheActivity = loggerMiddleware.logCacheActivity;
export const logEvent = loggerMiddleware.logEvent;
export const logSecurityEvent = loggerMiddleware.logSecurityEvent;
export const auditLog = loggerMiddleware.auditLog;
