import { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import hpp from "hpp";
import compression from "compression";
import environment from "../../config/environment";
import logger from "../utils/logger.util";

class SecurityMiddleware {
  private static instance: SecurityMiddleware;

  private constructor() {}

  public static getInstance(): SecurityMiddleware {
    if (!SecurityMiddleware.instance) {
      SecurityMiddleware.instance = new SecurityMiddleware();
    }
    return SecurityMiddleware.instance;
  }

  /**
   * Helmet - Security headers
   */
  public helmet = () => {
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    });
  };

  /**
   * CORS configuration
   */
  public cors = () => {
    return cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) {
          return callback(null, true);
        }

        const allowedOrigins = environment.corsOrigin;

        if (allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
          callback(null, true);
        } else {
          logger.warn("CORS blocked request", { origin });
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: environment.corsCredentials,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "X-API-Key",
        "X-Refresh-Token",
      ],
      exposedHeaders: [
        "X-Total-Count",
        "X-Page",
        "X-Per-Page",
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
      ],
      maxAge: 86400, // 24 hours
    });
  };

  /**
   * HPP - HTTP Parameter Pollution protection
   */
  public hpp = () => {
    return hpp({
      whitelist: [
        "page",
        "limit",
        "sort",
        "filter",
        "search",
        "status",
        "type",
        "category",
      ],
    });
  };

  /**
   * Compression middleware
   */
  public compression = () => {
    return compression({
      level: 6,
      threshold: 1024, // Only compress responses > 1KB
      filter: (req, res) => {
        if (req.headers["x-no-compression"]) {
          return false;
        }
        return compression.filter(req, res);
      },
    });
  };

  /**
   * Custom security headers
   */
  public customHeaders = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    // Remove powered-by header
    res.removeHeader("X-Powered-By");

    // Add custom security headers
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "geolocation=(), microphone=(), camera=()",
    );

    // HSTS (HTTP Strict Transport Security)
    if (environment.isProduction()) {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains; preload",
      );
    }

    next();
  };

  /**
   * Enforce HTTPS in production
   */
  public enforceHttps = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    if (environment.isProduction()) {
      if (
        req.headers["x-forwarded-proto"] !== "https" &&
        req.protocol !== "https"
      ) {
        logger.warn("HTTP request in production, redirecting to HTTPS", {
          url: req.url,
          ip: req.ip,
        });
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
      }
    }
    next();
  };

  /**
   * Prevent clickjacking
   */
  public preventClickjacking = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    next();
  };

  /**
   * Content Type validation
   */
  public validateContentType = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    if (["POST", "PUT", "PATCH"].includes(req.method)) {
      const contentType = req.headers["content-type"];

      if (!contentType) {
        logger.warn("Missing Content-Type header", {
          method: req.method,
          path: req.path,
        });

        res.status(400).json({
          success: false,
          message: "Content-Type header is required",
        });
      } else {
        const allowedTypes = [
          "application/json",
          "multipart/form-data",
          "application/x-www-form-urlencoded",
        ];

        const isAllowed = allowedTypes.some((type) =>
          contentType.includes(type),
        );

        if (!isAllowed) {
          logger.warn("Invalid Content-Type header", {
            contentType,
            method: req.method,
            path: req.path,
          });
          res.status(415).json({
            success: false,
            message: "Unsupported Media Type",
          });
        }
      }
    }

    next();
  };

  /**
   * Request size limiter
   */
  public limitRequestSize = (maxSizeInMB: number = 10) => {
    const maxSize = maxSizeInMB * 1024 * 1024; // Convert to bytes

    return (req: Request, res: Response, next: NextFunction): void => {
      const contentLength = parseInt(req.headers["content-length"] || "0", 10);

      if (contentLength > maxSize) {
        logger.warn("Request size exceeds limit", {
          contentLength,
          maxSize,
          path: req.path,
        });
        res.status(413).json({
          success: false,
          message: `Request entity too large. Maximum size is ${maxSizeInMB}MB`,
        });
      }

      next();
    };
  };

  /**
   * Prevent host header injection
   */
  public validateHostHeader = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const host = req.headers.host;
    const allowedHosts = [
      "localhost",
      "127.0.0.1",
      environment.appUrl.replace(/^https?:\/\//, ""),
    ];

    if (!host || !allowedHosts.some((allowed) => host.includes(allowed))) {
      logger.warn("Invalid host header", {
        host,
        ip: req.ip,
      });
      res.status(400).json({
        success: false,
        message: "Invalid host header",
      });
    }

    next();
  };

  /**
   * API versioning header
   */
  public addApiVersion = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    res.setHeader("X-API-Version", environment.apiVersion);
    next();
  };

  /**
   * Request ID for tracking
   */
  public addRequestId = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const requestId =
      req.headers["x-request-id"] ||
      `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    (req as any).id = requestId;
    res.setHeader("X-Request-ID", requestId.toString());

    next();
  };

  /**
   * Prevent MIME type sniffing
   */
  public preventMimeSniffing = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  };

  /**
   * Set Cache-Control headers
   */
  public setCacheControl = (maxAge: number = 0) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (maxAge > 0) {
        res.setHeader("Cache-Control", `private, max-age=${maxAge}`);
      } else {
        res.setHeader(
          "Cache-Control",
          "no-store, no-cache, must-revalidate, proxy-revalidate",
        );
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
      next();
    };
  };

  /**
   * Prevent information disclosure
   */
  public preventInfoDisclosure = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    // Remove server header
    res.removeHeader("Server");
    res.removeHeader("X-Powered-By");

    next();
  };

  /**
   * IP whitelist/blacklist
   */
  public ipFilter = (options: {
    whitelist?: string[];
    blacklist?: string[];
  }) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      const clientIp = req.ip || req.socket.remoteAddress || "";

      if (options.blacklist && options.blacklist.includes(clientIp)) {
        logger.warn("Blacklisted IP attempted access", {
          ip: clientIp,
          path: req.path,
        });
        res.status(403).json({
          success: false,
          message: "Access forbidden",
        });
      }

      if (options.whitelist && !options.whitelist.includes(clientIp)) {
        logger.warn("Non-whitelisted IP attempted access", {
          ip: clientIp,
          path: req.path,
        });
        res.status(403).json({
          success: false,
          message: "Access forbidden",
        });
      }

      next();
    };
  };

  /**
   * Comprehensive security setup
   */
  public setupSecurity = () => {
    return [
      this.helmet(),
      this.cors(),
      this.hpp(),
      this.compression(),
      this.customHeaders,
      this.preventInfoDisclosure,
      this.addRequestId,
      this.addApiVersion,
    ];
  };
}

// Export singleton instance
const securityMiddleware = SecurityMiddleware.getInstance();

export default securityMiddleware;

// Export individual middleware functions
export const helmetSecurity = securityMiddleware.helmet;
export const corsPolicy = securityMiddleware.cors;
export const hppProtection = securityMiddleware.hpp;
export const compressionMiddleware = securityMiddleware.compression;
export const customHeaders = securityMiddleware.customHeaders;
export const enforceHttps = securityMiddleware.enforceHttps;
export const preventClickjacking = securityMiddleware.preventClickjacking;
export const validateContentType = securityMiddleware.validateContentType;
export const limitRequestSize = securityMiddleware.limitRequestSize;
export const validateHostHeader = securityMiddleware.validateHostHeader;
export const addApiVersion = securityMiddleware.addApiVersion;
export const addRequestId = securityMiddleware.addRequestId;
export const preventMimeSniffing = securityMiddleware.preventMimeSniffing;
export const setCacheControl = securityMiddleware.setCacheControl;
export const preventInfoDisclosure = securityMiddleware.preventInfoDisclosure;
export const ipFilter = securityMiddleware.ipFilter;
export const setupSecurity = securityMiddleware.setupSecurity;
